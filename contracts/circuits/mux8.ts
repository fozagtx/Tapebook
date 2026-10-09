// MUX8 spec: data = pins 0–7, select = pins 8–10 → pin 0 = data[select].
// Three levels of 2-to-1 muxes (4 NAND each), output stage. 30 NAND.
import { NetlistBuilder, type Built } from '../../core/netlist';

/** s ? hi : lo, 4 NAND. */
export function mux2(b: NetlistBuilder, lo: number, hi: number, s: number): number {
  const ns = b.nand(s, s);
  const t1 = b.nand(lo, ns);
  const t2 = b.nand(hi, s);
  return b.nand(t1, t2);
}

export function buildMux8(): Built {
  const b = new NetlistBuilder(11);
  let level = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => b.input(i));
  for (let s = 0; s < 3; s++) {
    const sel = b.input(8 + s);
    const next: number[] = [];
    for (let j = 0; j < level.length; j += 2) next.push(mux2(b, level[j], level[j + 1], sel));
    level = next;
  }
  b.outputStage(level);
  return b.build(1);
}

export function mux8Ref(x: number): number {
  const sel = (x >> 8) & 7;
  return (x >> sel) & 1;
}
