// Hunt: counterexample search with TapeOut's own eval. Every candidate is checked by
// TapebookClaims.differs(claimId, x) through Multicall3 eth_call batches at one block.
// A result is a local observation of the chain at that block.
import { encodeAbiParameters, keccak256, type Address, type Hex, type PublicClient } from 'viem';
import { bytesToHex, packInt } from '../../contracts/core/bits';
import { tapebookClaimsAbi } from './abi';
import { HUNT } from './config';

/** Candidate inputs as integers (pin i = bit i). */
export function* candidates(nIn: number, seed = 1): Generator<bigint> {
  const total = 1n << BigInt(nIn);
  if (nIn <= HUNT.fullSweepMaxPins) {
    for (let x = 0n; x < total; x++) yield x;
    return;
  }
  const all = total - 1n;
  const seen = new Set<bigint>();
  const fresh = function* (x: bigint) {
    if (!seen.has(x)) {
      seen.add(x);
      yield x;
    }
  };
  yield* fresh(0n);
  yield* fresh(all);
  for (let i = 0; i < nIn; i++) yield* fresh(1n << BigInt(i)); // one-hot
  for (let i = 0; i < nIn; i++) yield* fresh(all ^ (1n << BigInt(i))); // one-cold
  for (let i = 1; i <= nIn; i++) {
    const run = (1n << BigInt(i)) - 1n; // walking fill: low i bits set …
    yield* fresh(run);
    yield* fresh(all ^ run); // … and high bits set
  }
  for (let w = 2; w <= 4; w++)
    for (let i = 0; i + w <= nIn; i++) yield* fresh(((1n << BigInt(w)) - 1n) << BigInt(i)); // walking windows
  // Seeded random (xorshift64*), reproducible from `seed`.
  let s = BigInt(seed) | 1n;
  const mask64 = (1n << 64n) - 1n;
  for (let k = 0; k < HUNT.randomBudget; k++) {
    let x = 0n;
    for (let filled = 0; filled < nIn; filled += 64) {
      s ^= s >> 12n;
      s ^= (s << 25n) & mask64;
      s ^= s >> 27n;
      x = (x << 64n) | ((s * 2685821657736338717n) & mask64);
    }
    yield* fresh(x & all);
  }
}

export function plannedCount(nIn: number): bigint | null {
  return nIn <= HUNT.fullSweepMaxPins ? 1n << BigInt(nIn) : null;
}

export interface HuntProgress {
  searched: number;
  batchSize: number;
  block: bigint;
}

export interface HuntResult {
  /** The first input found where target and spec disagree, canonical bytes. */
  found: Hex | null;
  searched: number;
  /** True when every input was checked (nIn ≤ fullSweepMaxPins). */
  exhaustive: boolean;
  total: bigint | null;
  block: bigint;
  aborted: boolean;
}

/**
 * Runs the search. Batches carry `batchSize` differs calls; at most `maxBatchesPerSecond` are sent;
 * on an RPC error the batch size (and with it the load) is halved and the batch retried.
 */
export async function hunt(params: {
  client: PublicClient;
  claims: Address;
  claimId: bigint;
  nIn: number;
  seed?: number;
  signal?: AbortSignal;
  onProgress?: (p: HuntProgress) => void;
  batchSize?: number;
  maxBatchesPerSecond?: number;
}): Promise<HuntResult> {
  const { client, claims, claimId, nIn, signal, onProgress } = params;
  const block = await client.getBlockNumber();
  let batchSize = params.batchSize ?? HUNT.batchSize;
  let rate = params.maxBatchesPerSecond ?? HUNT.maxBatchesPerSecond;
  const total = plannedCount(nIn);
  const gen = candidates(nIn, params.seed ?? Number(claimId));
  let searched = 0;
  let pending: bigint[] = [];
  let exhaustedGen = false;
  const sent: number[] = [];

  const take = (n: number) => {
    while (pending.length < n && !exhaustedGen) {
      const r = gen.next();
      if (r.done) exhaustedGen = true;
      else pending.push(r.value);
    }
    return pending.slice(0, n);
  };

  while (true) {
    if (signal?.aborted) return { found: null, searched, exhaustive: false, total, block, aborted: true };
    const batch = take(batchSize);
    if (batch.length === 0) break;

    // Rate limit: at most `rate` batches in any one-second window.
    const now = Date.now();
    while (sent.length && now - sent[0] > 1000) sent.shift();
    if (sent.length >= rate) {
      await new Promise((r) => setTimeout(r, 1000 - (now - sent[0]) + 5));
      continue;
    }
    sent.push(Date.now());

    const inputs = batch.map((x) => bytesToHex(packInt(x, nIn)));
    try {
      const res = await client.multicall({
        contracts: inputs.map((x) => ({ address: claims, abi: tapebookClaimsAbi, functionName: 'differs', args: [claimId, x] }) as const),
        allowFailure: true,
        blockNumber: block,
        batchSize: 0,
      });
      const failed = res.findIndex((r) => r.status !== 'success');
      if (failed >= 0) throw new Error(`differs reverted for input ${inputs[failed]}`);
      const hit = res.findIndex((r) => r.result === true);
      if (hit >= 0) return { found: inputs[hit], searched: searched + hit + 1, exhaustive: false, total, block, aborted: false };
      searched += batch.length;
      pending = pending.slice(batch.length);
      onProgress?.({ searched, batchSize, block });
    } catch (e) {
      if (batchSize <= HUNT.minBatchSize) throw e;
      batchSize = Math.max(HUNT.minBatchSize, batchSize >> 1);
      rate = Math.max(1, rate >> 1);
      onProgress?.({ searched, batchSize, block });
    }
  }
  return { found: null, searched, exhaustive: total !== null && BigInt(searched) === total, total, block, aborted: false };
}

/** keccak256(abi.encode(claimId, x, sender)): what `commit` takes. */
export function commitment(claimId: bigint, x: Hex, sender: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }], [claimId, x, sender]));
}
