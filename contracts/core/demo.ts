// Inputs shown by the landing page's "how a claim breaks" animation: Tapebook's reference
// pair, Target B claimed against ADD8C. Every output here is checked against TapeOut's own
// eval in contracts/test/demo.test.ts, so the animation shows what the chain computes.
// x packs a = pins 0–7, b = pins 8–15, cin = pin 16; outputs are the 9-bit sums.

export interface DemoVector {
  a: number;
  b: number;
  cin: 0 | 1;
  /** Output of Target B. */
  target: number;
  /** Output of the ADD8C spec. */
  spec: number;
}

/** Inputs a hunter tries that do not break the claim (outputs agree). */
export const DEMO_MISSES: DemoVector[] = [
  { a: 0, b: 0, cin: 0, target: 0, spec: 0 },
  { a: 2, b: 3, cin: 0, target: 5, spec: 5 },
  { a: 17, b: 25, cin: 1, target: 43, spec: 43 },
  { a: 40, b: 60, cin: 0, target: 100, spec: 100 },
  { a: 200, b: 100, cin: 0, target: 300, spec: 300 },
  { a: 250, b: 9, cin: 1, target: 260, spec: 260 },
  { a: 64, b: 63, cin: 0, target: 127, spec: 127 },
];

/** The lowest input where Target B and ADD8C disagree: 127 + 1. */
export const DEMO_HIT: DemoVector = { a: 127, b: 1, cin: 0, target: 384, spec: 128 };

export function demoInput(v: DemoVector): number {
  return v.a | (v.b << 8) | (v.cin << 16);
}
