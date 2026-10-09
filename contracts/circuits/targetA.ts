// Target A: a Tapebook reference target with ADD8C's pin layout, built differently.
// Per bit: two half adders (5 NAND each) and an OR (3 NAND); then the output stage. 122 NAND.
import { NetlistBuilder, type Built } from '../core/netlist';

export function halfAdder5(b: NetlistBuilder, a: number, x: number): { sum: number; carry: number } {
  const n1 = b.nand(a, x);
  const n2 = b.nand(a, n1);
  const n3 = b.nand(x, n1);
  const sum = b.nand(n2, n3);
  const carry = b.nand(n1, n1);
  return { sum, carry };
}

/** Builds the 8-bit adder; `faultyCarryOut` takes output pin 8 from bit 6's carry (Target B). */
export function buildAdderA(faultyCarryOut: boolean): Built {
  const b = new NetlistBuilder(17);
  let carry = b.input(16);
  const sums: number[] = [];
  const carries: number[] = [];
  for (let i = 0; i < 8; i++) {
    const h1 = halfAdder5(b, b.input(i), b.input(8 + i));
    const h2 = halfAdder5(b, h1.sum, carry);
    carry = b.or(h1.carry, h2.carry);
    sums.push(h2.sum);
    carries.push(carry);
  }
  b.outputStage([...sums, faultyCarryOut ? carries[6] : carries[7]]);
  return b.build(9);
}

export function buildTargetA(): Built {
  return buildAdderA(false);
}

export { add8cRef as targetARef } from './add8c';
