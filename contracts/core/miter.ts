// Miter circuit (PRD section 7). One pure function of
// (tapebook, cpu, id, specId, nIn, nOut), byte-identical to MiterLib.build.
//
//   x[k] = 2+k                                   k < nIn
//   REF T (ins = x)  → t[i] = 2+nIn+i
//   REF S (ins = x)  → s[i] = 2+nIn+nOut+i
//   d[i] = XOR(t[i], s[i])                       4 NAND each, index order
//   acc = d[0]; acc = OR(acc, d[i])              3 NAND each
//   output = acc (the last signal), so the miter has 1 output pin.
//
// The miter outputs 1 exactly on inputs where target and spec disagree.

import { NetlistBuilder, MAX_U64 } from './netlist';
import type { Hex } from './bits';

export const MAX_MITER_PINS = 255;

export interface MiterShape {
  /** The Tapebook processor (Circuits address) that holds the spec. */
  tapebook: Hex;
  /** The target processor and circuit. */
  cpu: Hex;
  id: bigint | number;
  /** Spec circuit id on the Tapebook processor. */
  specId: bigint | number;
  nIn: number;
  nOut: number;
}

/** NAND transistors a miter burns: 4·nOut + 3·(nOut − 1). */
export function miterNand(nOut: number): number {
  return 4 * nOut + 3 * (nOut - 1);
}

/** Byte length of a miter netlist. */
export function miterSize(nIn: number, nOut: number): number {
  return 2 * (31 + 3 * nIn) + 7 * miterNand(nOut);
}

export function buildMiter(m: MiterShape): { netlist: Hex; nIn: number; nOut: 1; nand: number } {
  const { nIn, nOut } = m;
  if (!Number.isInteger(nIn) || nIn < 0 || nIn > MAX_MITER_PINS) throw new RangeError(`nIn out of range: ${nIn}`);
  if (!Number.isInteger(nOut) || nOut < 1 || nOut > MAX_MITER_PINS) throw new RangeError(`nOut out of range: ${nOut}`);
  const id = BigInt(m.id);
  const specId = BigInt(m.specId);
  if (id < 0n || id > MAX_U64 || specId < 0n || specId > MAX_U64) throw new RangeError('circuit id out of u64 range');

  const b = new NetlistBuilder(nIn);
  const x = Array.from({ length: nIn }, (_, k) => b.input(k));
  const t = b.ref(m.cpu, id, x, nOut);
  const s = b.ref(m.tapebook, specId, x, nOut);
  const d = t.map((ti, i) => b.xor(ti, s[i]));
  let acc = d[0];
  for (let i = 1; i < nOut; i++) acc = b.or(acc, d[i]);
  return { netlist: b.encode(), nIn, nOut: 1, nand: miterNand(nOut) };
}
