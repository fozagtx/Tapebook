// Target B: Target A with one planted fault — output pin 8 is the carry out of bit 6
// instead of bit 7. 122 NAND. It differs from ADD8C on exactly 32,768 of 131,072 inputs.
import type { Built } from '../core/netlist';
import { buildAdderA } from './targetA';

export function buildTargetB(): Built {
  return buildAdderA(true);
}

/** Reference behaviour of the faulty design (tests only). */
export function targetBRef(x: number): number {
  const a = x & 0xff;
  const bb = (x >> 8) & 0xff;
  const cin = (x >> 16) & 1;
  const sum = (a + bb + cin) & 0xff;
  const c6 = ((a & 0x7f) + (bb & 0x7f) + cin) >> 7; // carry into bit 7 = carry out of bit 6
  return sum | (c6 << 8);
}
