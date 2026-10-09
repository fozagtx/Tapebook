// TapeOut netlist encoding (PRD section 3, NetlistVM.sol).
// Big-endian integers. Signals: 0 = const 0, 1 = const 1, 2 … 1+nIn = inputs;
// every element appends its output signal(s) in order.
//
//   NAND  0x00  7 bytes          op, a:u24, b:u24 (both earlier)          appends 1
//   LATCH 0x01  4 bytes          op, d:u24                                appends 1
//   REF   0x02  31 + 3·rIn bytes op, cpu:address, circuitId:u64, rIn:u8,  appends rOut
//                                rOut:u8, ins:u24[rIn]
//
// This module encodes and decodes. It deliberately has no evaluator: all evaluation
// is TapeOut's own on-chain `eval`.

import { bytesToHex, hexToBytes, type Hex } from './bits';

export const OP_NAND = 0x00;
export const OP_LATCH = 0x01;
export const OP_REF = 0x02;

export const MAX_U24 = 0xffffff;
export const MAX_U64 = 0xffffffffffffffffn;

export type NandEl = { op: typeof OP_NAND; a: number; b: number; out: number };
export type LatchEl = { op: typeof OP_LATCH; d: number; out: number };
export type RefEl = {
  op: typeof OP_REF;
  cpu: Hex;
  circuitId: bigint;
  ins: number[];
  nOut: number;
  outs: number[];
};
export type Element = NandEl | LatchEl | RefEl;

export interface Built {
  netlist: Hex;
  nIn: number;
  nOut: number;
  /** NAND transistors this layer burns at tape-out (REF burns nothing). */
  nand: number;
}

function pushU24(out: number[], v: number): void {
  if (!Number.isInteger(v) || v < 0 || v > MAX_U24) throw new RangeError(`signal out of u24 range: ${v}`);
  out.push((v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

function pushU64(out: number[], v: bigint): void {
  if (v < 0n || v > MAX_U64) throw new RangeError(`u64 out of range: ${v}`);
  for (let i = 7; i >= 0; i--) out.push(Number((v >> BigInt(8 * i)) & 0xffn));
}

function pushAddress(out: number[], a: string): void {
  const h = a.replace(/^0x/, '').toLowerCase();
  if (h.length !== 40 || /[^0-9a-f]/.test(h)) throw new Error(`bad address: ${a}`);
  for (let i = 0; i < 40; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
}

/** Incremental netlist builder. Signal indices are returned so callers can wire elements. */
export class NetlistBuilder {
  readonly nIn: number;
  readonly elements: Element[] = [];
  private next: number;

  constructor(nIn: number) {
    if (!Number.isInteger(nIn) || nIn < 0) throw new RangeError(`bad nIn: ${nIn}`);
    this.nIn = nIn;
    this.next = 2 + nIn;
  }

  get ZERO(): number {
    return 0;
  }
  get ONE(): number {
    return 1;
  }
  /** Number of signals so far (constants + inputs + element outputs). */
  get signals(): number {
    return this.next;
  }

  input(i: number): number {
    if (i < 0 || i >= this.nIn) throw new RangeError(`input ${i} out of range 0..${this.nIn - 1}`);
    return 2 + i;
  }

  private checkEarlier(s: number): void {
    if (!Number.isInteger(s) || s < 0 || s >= this.next) throw new RangeError(`signal ${s} is not an earlier signal`);
  }

  nand(a: number, b: number): number {
    this.checkEarlier(a);
    this.checkEarlier(b);
    const out = this.next++;
    this.elements.push({ op: OP_NAND, a, b, out });
    return out;
  }

  latch(d: number): number {
    const out = this.next++;
    this.elements.push({ op: OP_LATCH, d, out });
    return out;
  }

  ref(cpu: Hex, circuitId: bigint | number, ins: number[], nOut: number): number[] {
    if (ins.length > 255 || nOut > 255 || nOut < 0) throw new RangeError(`REF pins out of u8 range: ${ins.length}/${nOut}`);
    ins.forEach((s) => this.checkEarlier(s));
    const outs: number[] = [];
    for (let k = 0; k < nOut; k++) outs.push(this.next++);
    this.elements.push({ op: OP_REF, cpu, circuitId: BigInt(circuitId), ins: ins.slice(), nOut, outs });
    return outs;
  }

  // Common gates, all from NAND.
  not(a: number): number {
    return this.nand(a, a);
  }
  and(a: number, b: number): number {
    const n = this.nand(a, b);
    return this.nand(n, n);
  }
  or(a: number, b: number): number {
    return this.nand(this.nand(a, a), this.nand(b, b));
  }
  xor(a: number, b: number): number {
    const n1 = this.nand(a, b);
    const n2 = this.nand(a, n1);
    const n3 = this.nand(b, n1);
    return this.nand(n2, n3);
  }

  /**
   * The two-pass output stage (PRD section 6). Outputs are the last nOut signals, so all
   * inverters are emitted first and then all re-inversions; interleaving them is wrong.
   */
  outputStage(xs: number[]): number[] {
    const inv = xs.map((x) => this.nand(x, x));
    return inv.map((v) => this.nand(v, this.ONE));
  }

  encode(): Hex {
    return encode(this.elements);
  }

  build(nOut: number): Built {
    return { netlist: this.encode(), nIn: this.nIn, nOut, nand: countBurn(this.elements).nand };
  }
}

export function encode(elements: Element[]): Hex {
  const out: number[] = [];
  for (const el of elements) {
    if (el.op === OP_NAND) {
      out.push(OP_NAND);
      pushU24(out, el.a);
      pushU24(out, el.b);
    } else if (el.op === OP_LATCH) {
      out.push(OP_LATCH);
      pushU24(out, el.d);
    } else {
      out.push(OP_REF);
      pushAddress(out, el.cpu);
      pushU64(out, el.circuitId);
      if (el.ins.length > 255 || el.nOut > 255) throw new RangeError('REF pins out of u8 range');
      out.push(el.ins.length, el.nOut);
      for (const s of el.ins) pushU24(out, s);
    }
  }
  return bytesToHex(Uint8Array.from(out));
}

/** Decodes a netlist and checks the same topological rules as NetlistVM.analyze (except REF targets). */
export function decode(netlist: Hex | Uint8Array, nIn: number): Element[] {
  const b = typeof netlist === 'string' ? hexToBytes(netlist) : netlist;
  const els: Element[] = [];
  let p = 0;
  let next = 2 + nIn;
  const need = (n: number) => {
    if (p + n > b.length) throw new Error(`truncated netlist at byte ${p}`);
  };
  const u24 = () => {
    need(3);
    const v = (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
    p += 3;
    return v;
  };
  while (p < b.length) {
    const op = b[p++];
    if (op === OP_NAND) {
      const a = u24();
      const c = u24();
      if (a >= next || c >= next) throw new Error(`NAND@${next}: future signal (a=${a}, b=${c})`);
      els.push({ op: OP_NAND, a, b: c, out: next++ });
    } else if (op === OP_LATCH) {
      els.push({ op: OP_LATCH, d: u24(), out: next++ });
    } else if (op === OP_REF) {
      need(30);
      let cpu = '0x';
      for (let i = 0; i < 20; i++) cpu += b[p + i].toString(16).padStart(2, '0');
      p += 20;
      let id = 0n;
      for (let i = 0; i < 8; i++) id = (id << 8n) | BigInt(b[p + i]);
      p += 8;
      const rIn = b[p++];
      const rOut = b[p++];
      const ins: number[] = [];
      for (let k = 0; k < rIn; k++) {
        const s = u24();
        if (s >= next) throw new Error(`REF: future signal ${s}`);
        ins.push(s);
      }
      const outs: number[] = [];
      for (let k = 0; k < rOut; k++) outs.push(next++);
      els.push({ op: OP_REF, cpu: cpu as Hex, circuitId: id, ins, nOut: rOut, outs });
    } else {
      throw new Error(`unknown opcode 0x${op.toString(16)} at byte ${p - 1}`);
    }
  }
  return els;
}

/** NAND and LATCH this layer burns; REF elements burn nothing (NetlistVM.burnOf). */
export function countBurn(elements: Element[]): { nand: number; latch: number; refs: number } {
  let nand = 0;
  let latch = 0;
  let refs = 0;
  for (const el of elements) {
    if (el.op === OP_NAND) nand++;
    else if (el.op === OP_LATCH) latch++;
    else refs++;
  }
  return { nand, latch, refs };
}

/** Distinct (cpu, circuitId) pairs referenced directly by a netlist. */
export function refTargets(elements: Element[]): { cpu: Hex; circuitId: bigint }[] {
  const seen = new Set<string>();
  const out: { cpu: Hex; circuitId: bigint }[] = [];
  for (const el of elements) {
    if (el.op !== OP_REF) continue;
    const k = `${el.cpu.toLowerCase()}:${el.circuitId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ cpu: el.cpu, circuitId: el.circuitId });
  }
  return out;
}
