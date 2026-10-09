import hre from 'hardhat';
import type { Address, Hex } from 'viem';
import { hexToBytes } from '../core/bits';

/** Deterministic PRNG (mulberry32) so random tests are reproducible from their seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    pick: <T>(xs: T[]): T => xs[Math.floor(next() * xs.length)],
    bool: (p = 0.5) => next() < p,
    bytes: (n: number) => Array.from({ length: n }, () => Math.floor(next() * 256)),
  };
}

export const EXHAUSTIVE = process.env.EXHAUSTIVE === '1';
const IN_PROCESS = hre.network.name === 'hardhat';
// Hardhat's in-process EVM slows down super-linearly with many nested calls in one eth_call,
// so it gets small chunks; an external node (npx hardhat node, anvil) takes large ones.
const CHUNK = Number(process.env.SWEEP_CHUNK ?? (IN_PROCESS ? 16 : 256));
const CONCURRENCY = Number(process.env.SWEEP_CONCURRENCY ?? 4);

let sweeper: Address | undefined;
async function sweepContract() {
  // Fixture snapshots revert later deployments, so check the helper still exists. It is deployed
  // from an account no fixture uses, so its address never collides with a fixture contract.
  const code = sweeper ? await (await hre.viem.getPublicClient()).getCode({ address: sweeper }) : undefined;
  if (!sweeper || !code || code === '0x') {
    const wallets = await hre.viem.getWalletClients();
    sweeper = (await hre.viem.deployContract('EvalSweep', [], { client: { wallet: wallets[9] } })).address;
  }
  return hre.viem.getContractAt('EvalSweep', sweeper);
}

/**
 * Evaluates circuit `id` on every integer input in the given ranges with TapeOut's own `eval`
 * and returns the outputs as integers (first `outBytes` bytes, little-endian), keyed by input.
 */
export async function sweepEval(
  circuits: Address,
  id: bigint,
  nIn: number,
  outBytes: number,
  ranges: [from: number, count: number][],
): Promise<Map<number, number>> {
  const sweep = await sweepContract();
  const jobs: [number, number][] = [];
  for (const [from, count] of ranges)
    for (let s = from; s < from + count; s += CHUNK) jobs.push([s, Math.min(CHUNK, from + count - s)]);
  const out = new Map<number, number>();
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const [from, count] = jobs[next++];
      // readContract forwards `gas` to eth_call; its types only omit it for view functions.
      const res: Hex = await sweep.read.sweepFull([circuits, id, BigInt(nIn), BigInt(outBytes), BigInt(from), BigInt(count)], {
        gas: 900_000_000n,
      } as never);
      const b = hexToBytes(res);
      for (let k = 0; k < count; k++) {
        let v = 0;
        for (let j = outBytes - 1; j >= 0; j--) v = v * 256 + b[k * outBytes + j];
        out.set(from + k, v);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

/**
 * All 2^nIn inputs when EXHAUSTIVE=1 or the space is small; otherwise a fixed sample:
 * the first and last 256 inputs, `extra` inputs, and 16 evenly spaced blocks of 64.
 */
export function inputRanges(nIn: number, extra: number[] = []): { ranges: [number, number][]; full: boolean } {
  const total = 2 ** nIn;
  if (EXHAUSTIVE || total <= 4096) return { ranges: [[0, total]], full: true };
  const ranges: [number, number][] = [
    [0, 256],
    [total - 256, 256],
  ];
  for (let k = 1; k < 16; k++) ranges.push([Math.floor((k * total) / 16), 64]);
  for (const x of extra) ranges.push([x, 1]);
  return { ranges, full: false };
}

export function describeCoverage(nIn: number, checked: number, full: boolean) {
  return full ? `all ${checked} inputs` : `${checked} of ${2 ** nIn} inputs (sampled; EXHAUSTIVE=1 for all)`;
}

/** Sends a write and waits for its receipt; external nodes mine asynchronously. */
export async function tx(p: Promise<Hex>) {
  const pc = await hre.viem.getPublicClient();
  const receipt = await pc.waitForTransactionReceipt({ hash: await p });
  if (receipt.status !== 'success') throw new Error(`transaction reverted: ${receipt.transactionHash}`);
  return receipt;
}
