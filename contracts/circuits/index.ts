// The six first-party circuits taped out on the Tapebook processor (PRD section 6).
import type { Built } from '../../core/netlist';
import { buildAdd8c, add8cRef } from './add8c';
import { buildMaj5, maj5Ref } from './maj5';
import { buildEq8, eq8Ref } from './eq8';
import { buildMux8, mux8Ref } from './mux8';
import { buildTargetA } from './targetA';
import { buildTargetB, targetBRef } from './targetB';

export type SeedKey = 'ADD8C' | 'MAJ5' | 'EQ8' | 'MUX8' | 'TARGET_A' | 'TARGET_B';

export interface Seed {
  key: SeedKey;
  kind: 'spec' | 'target';
  name: string;
  description: string;
  build: () => Built;
  /** Reference behaviour for tests: input integer → output integer. */
  ref: (x: number) => number;
  expectedNand: number;
}

export const SEEDS: Seed[] = [
  { key: 'ADD8C', kind: 'spec', name: 'ADD8C', description: '8-bit add with carry: a + b + cin (a = pins 0–7, b = 8–15, cin = 16; sum = 0–7, cout = 8)', build: buildAdd8c, ref: add8cRef, expectedNand: 90 },
  { key: 'MAJ5', kind: 'spec', name: 'MAJ5', description: '5-input majority: 1 when three or more of pins 0–4 are 1', build: buildMaj5, ref: maj5Ref, expectedNand: 51 },
  { key: 'EQ8', kind: 'spec', name: 'EQ8', description: '8-bit equality: 1 when a (pins 0–7) equals b (pins 8–15)', build: buildEq8, ref: eq8Ref, expectedNand: 56 },
  { key: 'MUX8', kind: 'spec', name: 'MUX8', description: '8-to-1 mux: data (pins 0–7) indexed by select (pins 8–10)', build: buildMux8, ref: mux8Ref, expectedNand: 30 },
  { key: 'TARGET_A', kind: 'target', name: 'Target A', description: 'Tapebook reference target: an 8-bit adder built from half adders, claimed against ADD8C', build: buildTargetA, ref: add8cRef, expectedNand: 122 },
  { key: 'TARGET_B', kind: 'target', name: 'Target B', description: 'Tapebook reference target: Target A with one planted fault (carry out taken from bit 6)', build: buildTargetB, ref: targetBRef, expectedNand: 122 },
];

export const SPEC_KEYS: SeedKey[] = ['ADD8C', 'MAJ5', 'EQ8', 'MUX8'];

export function seed(key: SeedKey): Seed {
  const s = SEEDS.find((x) => x.key === key);
  if (!s) throw new Error(`unknown seed ${key}`);
  return s;
}
