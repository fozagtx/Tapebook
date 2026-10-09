// All tunable values and addresses in one place (PRD sections 10, 12, 15).
import { defineChain, getAddress, type Address, type Chain } from 'viem';
import { xLayer } from 'viem/chains';

const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

/** X Layer mainnet deployment (contracts/deployments/196.json). NEXT_PUBLIC_* env vars override. */
export const MAINNET = {
  factory: '0x1f09daefa827f02cbb40967cc91b259763760761',
  /** Block the factory proxy first had code (binary-searched via eth_getCode). */
  factoryDeployBlock: 70_995_047n,
  claims: '0xF225AEc83B2738b791b3CD76006e248814bE55F0',
  circuits: '0x20CEC0Ca666B43e0CbCDBb50b0b6fdf6F2D7Dd13',
  transistors: '0x3F35dc7C698bAE36F32ae83bABAEce7e3BF2D039',
} as const;

function addr(v: string | undefined): Address | null {
  if (!v) return null;
  try {
    return getAddress(v.trim());
  } catch {
    return null;
  }
}

/**
 * Local development against a node running the vendored TapeOut stack
 * (contracts: `npm run local:deploy`). Unset in production.
 */
const LOCAL_RPC = process.env.NEXT_PUBLIC_LOCAL_RPC_URL || '';
export const IS_LOCAL = LOCAL_RPC !== '';

const localChain = defineChain({
  id: 31337,
  name: 'Local TapeOut',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_RPC || 'http://127.0.0.1:8545'] } },
  contracts: { multicall3: { address: MULTICALL3, blockCreated: 0 } },
});

export const CHAIN: Chain = IS_LOCAL ? localChain : xLayer;

/** Public RPCs (browser). The documented limit is 100 requests per second per IP. */
export const PUBLIC_RPC_URLS: string[] = IS_LOCAL ? [LOCAL_RPC] : ['https://xlayerrpc.okx.com', 'https://rpc.xlayer.tech'];

/** Server-side RPCs: XLAYER_RPC_URL overrides the public endpoints. */
export function serverRpcUrls(): string[] {
  const o = process.env.XLAYER_RPC_URL;
  return o ? [o, ...PUBLIC_RPC_URLS] : PUBLIC_RPC_URLS;
}

export const EXPLORER = IS_LOCAL ? null : 'https://www.oklink.com/xlayer';

/** TapeOut factories the Book indexes. A v2 factory is added here with its own TapebookClaims. */
export interface FactoryConfig {
  label: string;
  address: Address;
  /** Block the factory proxy was deployed at; bounds the version watcher's log scan. Null = discover. */
  deployBlock: bigint | null;
  /** TapebookClaims deployment for this factory, if any. */
  claims: Address | null;
}

export const FACTORIES: FactoryConfig[] = IS_LOCAL
  ? [
      {
        label: 'TapeOut (local)',
        address: addr(process.env.NEXT_PUBLIC_TAPEOUT_FACTORY) ?? '0x0000000000000000000000000000000000000000',
        deployBlock: 0n,
        claims: addr(process.env.NEXT_PUBLIC_CLAIMS_ADDRESS),
      },
    ]
  : [
      {
        label: 'TapeOut v1',
        address: getAddress(MAINNET.factory),
        deployBlock: process.env.NEXT_PUBLIC_TAPEOUT_DEPLOY_BLOCK ? BigInt(process.env.NEXT_PUBLIC_TAPEOUT_DEPLOY_BLOCK) : MAINNET.factoryDeployBlock,
        claims: addr(process.env.NEXT_PUBLIC_CLAIMS_ADDRESS) ?? getAddress(MAINNET.claims),
      },
    ];

/** The Tapebook processor and its claims contract (first factory). */
export const TAPEBOOK = IS_LOCAL
  ? {
      claims: addr(process.env.NEXT_PUBLIC_CLAIMS_ADDRESS),
      circuits: addr(process.env.NEXT_PUBLIC_TAPEBOOK_CIRCUITS),
      transistors: addr(process.env.NEXT_PUBLIC_TAPEBOOK_TRANSISTORS),
    }
  : {
      claims: addr(process.env.NEXT_PUBLIC_CLAIMS_ADDRESS) ?? getAddress(MAINNET.claims),
      circuits: addr(process.env.NEXT_PUBLIC_TAPEBOOK_CIRCUITS) ?? getAddress(MAINNET.circuits),
      transistors: addr(process.env.NEXT_PUBLIC_TAPEBOOK_TRANSISTORS) ?? getAddress(MAINNET.transistors),
    };

export const INDEX = {
  /** Calls per Multicall3 aggregate3 request. */
  batch: 200,
  /** Netlist reads return whole netlists, so they go in smaller batches. */
  netlistBatch: 50,
  /** Parallel RPC requests while building the snapshot. */
  concurrency: 8,
};

export const HUNT = {
  /** differs(claimId, x) calls per Multicall3 batch; halved automatically on an RPC error. */
  batchSize: 256,
  /** At most this many batches per second (documented limit: 100 requests per second per IP). */
  maxBatchesPerSecond: 20,
  /** Inputs up to this many pins are swept exhaustively. */
  fullSweepMaxPins: 16,
  /** Patterned and random search budget for larger inputs. */
  randomBudget: 65_536,
  minBatchSize: 1,
};

export const VERSIONS = {
  /** Blocks per eth_getLogs request; halved automatically on an RPC error. */
  logChunk: 100_000n,
  minLogChunk: 500n,
  concurrency: 4,
  /** The upgrade-history log scan needs an RPC that allows wide eth_getLogs ranges. The public X Layer RPCs cap eth_getLogs at 100 blocks, so the scan is only attempted when XLAYER_RPC_URL points at a provider that supports it. */
  scanHistory: Boolean(process.env.XLAYER_RPC_URL),
};

/** Contract constants mirrored for display; the contract enforces them. */
export const LIMITS = {
  maxBond: 10n ** 18n,
  maxGates: 1000,
  minLockSeconds: 86_400n,
  revealDelayBlocks: 1n,
};

export const REPO_URL = 'https://github.com/fozagtx/Tapebook';
export const TAPEOUT_URL = 'https://github.com/davieslennox0/nandout';
export const XLAYER_URL = 'https://www.okx.com/xlayer';
