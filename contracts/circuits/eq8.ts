// EQ8 spec: a = pins 0–7, b = pins 8–15 → pin 0 is 1 when a equals b.
// 8 XNOR (5 NAND each), AND-reduced, output stage. 56 NAND.
import { NetlistBuilder, type Built } from '../../core/netlist';

export function buildEq8(): Built {
  const b = new NetlistBuilder(16);
  const xn: number[] = [];
  for (let i = 0; i < 8; i++) xn.push(b.not(b.xor(b.input(i), b.input(8 + i))));
  let acc = xn[0];
  for (let i = 1; i < 8; i++) acc = b.and(acc, xn[i]);
  b.outputStage([acc]);
  return b.build(1);
}

export function eq8Ref(x: number): number {
  return (x & 0xff) === ((x >> 8) & 0xff) ? 1 : 0;
}
