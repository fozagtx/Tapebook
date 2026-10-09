// Hero illustration: the real netlist of Tapebook's reference target (Target A, an 8-bit adder),
// laid out by logic depth. Every dot is one NAND that TapeOut burned; the moss line is the
// circuit's longest path, from an input pin to an output pin.
import { decode, OP_NAND } from '../../../core/netlist';
import { buildTargetA } from '../../../contracts/circuits/targetA';

const W = 1200;
const H = 260;
const PAD = 16;

function layout() {
  const b = buildTargetA();
  const els = decode(b.netlist, b.nIn).filter((e) => e.op === OP_NAND);
  const depth = new Map<number, number>();
  const pred = new Map<number, [number, number]>();
  for (let i = 0; i < 2 + b.nIn; i++) depth.set(i, 0);
  const cols = new Map<number, number[]>([[0, Array.from({ length: b.nIn }, (_, i) => 2 + i)]]);
  for (const el of els) {
    if (el.op !== OP_NAND) continue;
    const d = 1 + Math.max(depth.get(el.a) ?? 0, depth.get(el.b) ?? 0);
    depth.set(el.out, d);
    pred.set(el.out, [el.a, el.b]);
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(el.out);
  }
  const maxD = Math.max(...cols.keys());
  const pos = new Map<number, [number, number]>();
  for (const [d, sigs] of cols)
    sigs.forEach((s, k) => pos.set(s, [PAD + (d / maxD) * (W - 2 * PAD), PAD + ((k + 0.5) / sigs.length) * (H - 2 * PAD)]));
  pos.set(1, [PAD, PAD]);
  pos.set(0, [PAD, H - PAD]);

  const wires: [number, number, number, number][] = [];
  for (const [out, [a, c]] of pred)
    for (const s of [a, c]) {
      const p = pos.get(s);
      const q = pos.get(out);
      if (p && q && s > 1) wires.push([p[0], p[1], q[0], q[1]]);
    }

  // Longest path: walk back from the deepest output through the deeper predecessor.
  const outputs = els.slice(-b.nOut).map((e) => e.out);
  let cur = outputs.reduce((m, s) => ((depth.get(s) ?? 0) > (depth.get(m) ?? 0) ? s : m), outputs[0]);
  const path: number[] = [cur];
  while (pred.has(cur)) {
    const [a, c] = pred.get(cur)!;
    cur = (depth.get(a) ?? 0) >= (depth.get(c) ?? 0) ? a : c;
    path.push(cur);
  }
  const pathD = path
    .reverse()
    .map((s, i) => `${i ? 'L' : 'M'}${pos.get(s)![0].toFixed(1)} ${pos.get(s)![1].toFixed(1)}`)
    .join(' ');

  const gates = [...pred.keys()].map((s) => pos.get(s)!);
  const inputs = cols.get(0)!.map((s) => pos.get(s)!);
  const outs = outputs.map((s) => pos.get(s)!);
  return { wires, gates, inputs, outs, pathD, nand: b.nand };
}

const ART = layout();

export function NetlistArt() {
  return (
    <figure className="container mt-14 flex flex-col items-center gap-3">
      <div className="w-full max-w-[1040px] overflow-hidden rounded-[var(--radius-lg)] border-2 border-line bg-bg-surface p-4 shadow-lg">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Netlist of Tapebook's reference 8-bit adder: ${ART.nand} NAND gates`}>
          <g stroke="var(--color-border-default)" strokeWidth={1}>
            {ART.wires.map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
          <path d={ART.pathD} fill="none" stroke="var(--color-olive-light)" strokeWidth={3} strokeLinejoin="round" />
          <path d={ART.pathD} pathLength={100} fill="none" stroke="var(--color-moss)" strokeWidth={4} strokeLinecap="round" className="netlist-pulse" />
          <g fill="var(--color-moss-light)">
            {ART.gates.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={3.2} />
            ))}
          </g>
          <g fill="var(--color-olive)">
            {ART.inputs.map(([x, y], i) => (
              <rect key={i} x={x - 4} y={y - 4} width={8} height={8} rx={1.5} />
            ))}
          </g>
          <g fill="var(--color-moss)">
            {ART.outs.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={5.5} />
            ))}
          </g>
        </svg>
      </div>
      <figcaption className="eyebrow-sm">Target A · 8-bit adder · {ART.nand} NAND, drawn from its netlist</figcaption>
    </figure>
  );
}
