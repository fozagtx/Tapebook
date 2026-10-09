// VM conformance vectors stored in TapebookClaims at deploy (PRD section 15, measure 5).
// Fixed inputs to the seed specs with outputs from their reference behaviour; after deploy,
// `conformance()` re-evaluates them on chain with TapeOut's own eval.
import { bytesToHex, packInt, type Hex } from '../core/bits';
import { seed, type SeedKey } from './index';

export interface Vector {
  spec: SeedKey;
  x: number;
  label: string;
}

export const VECTORS: Vector[] = [
  { spec: 'ADD8C', x: 2 | (3 << 8), label: 'ADD8C(2, 3, 0) = 5' },
  { spec: 'ADD8C', x: 255 | (1 << 8) | (1 << 16), label: 'ADD8C(255, 1, 1) = 257' },
  { spec: 'MAJ5', x: 0b10101, label: 'MAJ5(1,0,1,0,1) = 1' },
  { spec: 'MAJ5', x: 0b00011, label: 'MAJ5(1,1,0,0,0) = 0' },
  { spec: 'EQ8', x: 0x5a | (0x5a << 8), label: 'EQ8(0x5a, 0x5a) = 1' },
  { spec: 'EQ8', x: 0x01 | (0x02 << 8), label: 'EQ8(0x01, 0x02) = 0' },
  { spec: 'MUX8', x: 0b0100_0000 | (6 << 8), label: 'MUX8(0x40, select 6) = 1' },
  { spec: 'MUX8', x: 0b0100_0000 | (5 << 8), label: 'MUX8(0x40, select 5) = 0' },
];

export function vectorBytes(v: Vector): { input: Hex; output: Hex } {
  const s = seed(v.spec);
  const { nIn, nOut } = s.build();
  return { input: bytesToHex(packInt(v.x, nIn)), output: bytesToHex(packInt(s.ref(v.x), nOut)) };
}
