// MAJ5 spec: pins 0–4 → pin 0 is 1 when three or more inputs are 1.
// Ten 3-input NAND terms, AND-reduced, inverted, output stage. 51 NAND.
import { NetlistBuilder, type Built } from '../../core/netlist';

export function buildMaj5(): Built {
  const b = new NetlistBuilder(5);
  const x = [0, 1, 2, 3, 4].map((i) => b.input(i));
  const terms: number[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = i + 1; j < 5; j++)
      for (let k = j + 1; k < 5; k++) {
        const ab = b.nand(x[i], x[j]);
        const and = b.nand(ab, ab);
        terms.push(b.nand(and, x[k])); // NAND3(x_i, x_j, x_k)
      }
  let acc = terms[0];
  for (let t = 1; t < terms.length; t++) acc = b.and(acc, terms[t]); // every term's NAND3 is 1
  const maj = b.not(acc); // some triple is all ones
  b.outputStage([maj]);
  return b.build(1);
}

export function maj5Ref(x: number): number {
  let ones = 0;
  for (let i = 0; i < 5; i++) ones += (x >> i) & 1;
  return ones >= 3 ? 1 : 0;
}
