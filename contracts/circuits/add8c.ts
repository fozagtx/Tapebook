// ADD8C spec: a = pins 0–7, b = pins 8–15, cin = pin 16 → sum = pins 0–7, cout = pin 8.
// Ripple carry with the 9-NAND full adder, then the two-pass output stage. 90 NAND.
import { NetlistBuilder, type Built } from '../core/netlist';

export function fullAdder9(b: NetlistBuilder, a: number, x: number, c: number): { sum: number; cout: number } {
  const n1 = b.nand(a, x);
  const n2 = b.nand(a, n1);
  const n3 = b.nand(x, n1);
  const p = b.nand(n2, n3);
  const n4 = b.nand(p, c);
  const n5 = b.nand(p, n4);
  const n6 = b.nand(c, n4);
  const sum = b.nand(n5, n6);
  const cout = b.nand(n1, n4);
  return { sum, cout };
}

export function buildAdd8c(): Built {
  const b = new NetlistBuilder(17);
  let carry = b.input(16);
  const sums: number[] = [];
  for (let i = 0; i < 8; i++) {
    const r = fullAdder9(b, b.input(i), b.input(8 + i), carry);
    sums.push(r.sum);
    carry = r.cout;
  }
  b.outputStage([...sums, carry]);
  return b.build(9);
}

/** Reference behaviour (tests only): input integer x → output integer. */
export function add8cRef(x: number): number {
  const a = x & 0xff;
  const bb = (x >> 8) & 0xff;
  const cin = (x >> 16) & 1;
  return a + bb + cin; // 9 bits: sum in 0–7, carry in 8
}
