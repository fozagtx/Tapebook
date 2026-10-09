// Deployment constants for the Tapebook processor (PRD sections 2, 5, 17).
import type { Address } from 'viem';
import type { SeedKey } from '../circuits';

/** TapeOut CircuitFactory (proxy) on X Layer mainnet. */
export const XLAYER_FACTORY: Address = '0x1f09daefa827f02cbb40967cc91b259763760761';
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

/** createCPU arguments. transistorSupply is the cap; there is no other cap. */
export const CPU = {
  name: 'Tapebook',
  symbol: 'TBOOK',
  supply: 1_000_000n,
  mintPrice: 100_000_000_000_000n, // 0.0001 OKB per transistor
  story:
    'Tapebook: a bug bounty layer for TapeOut circuits on X Layer. ' +
    'Supply: 1,000,000 transistors, and this supply is the cap (no other cap). ' +
    'Price: 0.0001 OKB per transistor. ' +
    'Every Tapebook spec and miter circuit is taped out on this processor and burns TBOOK NAND. ' +
    'A claim says a circuit behaves exactly like a spec on every input; one input where they disagree breaks it. ' +
    'Tapebook launches no token and has no trading component.',
} as const;

const SOURCE_FILE: Record<SeedKey, string> = {
  ADD8C: 'add8c',
  MAJ5: 'maj5',
  EQ8: 'eq8',
  MUX8: 'mux8',
  TARGET_A: 'targetA',
  TARGET_B: 'targetB',
};

export const REPO = 'https://github.com/fozagtx/Tapebook';

export function sourceUri(key: SeedKey): string {
  return `${REPO}/blob/main/contracts/circuits/${SOURCE_FILE[key]}.ts`;
}

/** Seed claims posted by 04-seed-claims.ts. Bonds are in wei and can be overridden by env. */
export const SEED_CLAIMS = {
  A: { target: 'TARGET_A' as SeedKey, bond: BigInt(process.env.SEED_BOND_A ?? '10000000000000000'), lock: 30n * 86_400n }, // 0.01 OKB
  B: { target: 'TARGET_B' as SeedKey, bond: BigInt(process.env.SEED_BOND_B ?? '2000000000000000'), lock: 86_400n }, // 0.002 OKB
};
