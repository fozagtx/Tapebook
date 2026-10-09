// Renders the Target A and ADD8C netlists as SVG drawings for the landing page footer
// (web/public/footer-left.png and footer-right.png are rasterised from these).
// Each gate is a dot placed by logic depth (x) and order within its depth (y); each wire is a line.
//   npx ts-node scripts/render-netlists.ts <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, OP_NAND } from '../../core/netlist';
import { buildAdd8c } from '../circuits/add8c';
import { buildTargetA } from '../circuits/targetA';
import type { Built } from '../../core/netlist';

function svgOf(b: Built, size = 900): string {
  const els = decode(b.netlist, b.nIn);
  const depth = new Map<number, number>();
  for (let i = 0; i < 2 + b.nIn; i++) depth.set(i, 0);
  const cols = new Map<number, number[]>();
  for (const el of els) {
    if (el.op !== OP_NAND) continue;
    const d = 1 + Math.max(depth.get(el.a) ?? 0, depth.get(el.b) ?? 0);
    depth.set(el.out, d);
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(el.out);
  }
  cols.set(0, Array.from({ length: b.nIn }, (_, i) => 2 + i));
  const maxD = Math.max(...cols.keys());
  const pad = 60;
  const pos = new Map<number, [number, number]>();
  for (const [d, sigs] of cols) {
    sigs.forEach((s, k) => {
      const x = pad + (d / maxD) * (size - 2 * pad);
      const y = pad + ((k + 0.5) / sigs.length) * (size - 2 * pad);
      pos.set(s, [x, y]);
    });
  }
  pos.set(0, [pad / 2, size - pad / 2]);
  pos.set(1, [pad / 2, pad / 2]);
  let wires = '';
  let dots = '';
  for (const el of els) {
    if (el.op !== OP_NAND) continue;
    const [x, y] = pos.get(el.out)!;
    for (const src of [el.a, el.b]) {
      const [sx, sy] = pos.get(src)!;
      wires += `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    }
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>`;
  }
  for (const s of cols.get(0)!) {
    const [x, y] = pos.get(s)!;
    dots += `<rect x="${(x - 10).toFixed(1)}" y="${(y - 10).toFixed(1)}" width="20" height="20"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" style="position:fixed;inset:0;background:#ffffff">
<rect width="100%" height="100%" fill="#ffffff"/>
<g stroke="#000000" stroke-opacity="0.55" stroke-width="2.5">${wires}</g>
<g fill="#000000">${dots}</g>
</svg>
`;
}

const out = process.argv[2] ?? '.';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'footer-left.svg'), svgOf(buildTargetA()));
fs.writeFileSync(path.join(out, 'footer-right.svg'), svgOf(buildAdd8c()));
console.log(`wrote footer-left.svg (Target A) and footer-right.svg (ADD8C) to ${out}`);
