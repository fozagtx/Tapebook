// The Book: a block-stamped snapshot of every TapeOut processor and circuit, read through
// Multicall3 at one block. No database; the chain is the only store. Values that cannot be
// read are null and render as "—".
import { getAddress, keccak256, zeroAddress, type Address, type Hex, type PublicClient } from 'viem';
import { decode, OP_REF } from '../../contracts/core/netlist';
import { buildMiter } from '../../contracts/core/miter';
import { circuitFactoryAbi, circuitsAbi, tapebookClaimsAbi, transistorsAbi } from './abi';
import { INDEX, type FactoryConfig } from './config';

export interface IndexedCircuit {
  id: string;
  nIn: number | null;
  nOut: number | null;
  nState: number | null;
  gateCount: number | null;
  owner: Address | null;
  /** keccak256 of the netlist; equal hashes are copies. */
  hash: Hex | null;
  /** Netlist size in bytes. */
  size: number | null;
  /** Set when this circuit is a Tapebook miter (target vs spec). */
  miterOf?: { cpu: Address; id: string; specId: string } | null;
}

export interface IndexedProcessor {
  circuits: Address;
  transistors: Address | null;
  name: string | null;
  symbol: string | null;
  supplyCap: string | null;
  minted: string | null;
  mintPrice: string | null;
  nextId: string | null;
  list: IndexedCircuit[];
}

export interface IndexedClaim {
  claimId: string;
  cpu: Address;
  id: string;
  specId: string;
  miterId: string;
  claimant: Address;
  bond: string;
  postedAt: string;
  lockUntil: string;
  status: 0 | 1 | 2;
  targetHash: Hex;
  nIn: number;
  circuitImpl: Address;
  breaker: Address;
  counterexample: Hex;
}

export interface IndexedSpec {
  specId: string;
  owner: Address;
  name: string;
  uri: string;
  /** One of the specs with conformance vectors stored in TapebookClaims at deploy. */
  seed: boolean;
}

export interface ClaimsSnapshot {
  address: Address;
  tapebook: Address | null;
  creator: Address | null;
  currentImpl: Address | null;
  conformance: boolean[] | null;
  count: string | null;
  list: IndexedClaim[];
  specs: IndexedSpec[];
}

export interface Snapshot {
  chainId: number;
  block: { number: string; timestamp: string };
  builtAt: string;
  factories: { label: string; address: Address; cpuCount: string | null; processors: IndexedProcessor[] }[];
  claims: ClaimsSnapshot | null;
  errors: string[];
}

type Call = { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] };

/**
 * Runs read calls through Multicall3 at one block, `batch` calls per request and `concurrency`
 * requests in flight. A request that fails is split in half and retried, so one oversized
 * response or one bad call costs only itself. Failed calls yield null.
 */
export async function readMany(
  client: PublicClient,
  calls: Call[],
  opts: { blockNumber: bigint; batch: number; concurrency: number; errors?: string[] },
): Promise<unknown[]> {
  const out: unknown[] = new Array(calls.length).fill(null);
  const queue: [number, number][] = [];
  for (let i = 0; i < calls.length; i += opts.batch) queue.push([i, Math.min(calls.length, i + opts.batch)]);

  async function run(lo: number, hi: number): Promise<void> {
    try {
      const res = (await client.multicall({
        contracts: calls.slice(lo, hi) as never,
        allowFailure: true,
        blockNumber: opts.blockNumber,
        batchSize: 0,
      })) as { status: 'success' | 'failure'; result?: unknown }[];
      res.forEach((r, k) => {
        out[lo + k] = r.status === 'success' ? r.result : null;
      });
    } catch (e) {
      if (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        await run(lo, mid);
        await run(mid, hi);
      } else {
        opts.errors?.push(`${calls[lo].functionName}@${calls[lo].address}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
      while (next < queue.length) {
        const [lo, hi] = queue[next++];
        await run(lo, hi);
      }
    }),
  );
  return out;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Recognises a Tapebook miter by rebuilding it from its own REF elements. */
function miterOf(netlist: Hex, nIn: number, tapebook: Address): IndexedCircuit['miterOf'] {
  try {
    const els = decode(netlist, nIn);
    const [t, s] = els;
    if (!t || !s || t.op !== OP_REF || s.op !== OP_REF) return null;
    if (s.cpu.toLowerCase() !== tapebook.toLowerCase() || t.nOut !== s.nOut) return null;
    const rebuilt = buildMiter({ tapebook, cpu: getAddress(t.cpu), id: t.circuitId, specId: s.circuitId, nIn, nOut: t.nOut });
    if (rebuilt.netlist.toLowerCase() !== netlist.toLowerCase()) return null;
    return { cpu: getAddress(t.cpu), id: t.circuitId.toString(), specId: s.circuitId.toString() };
  } catch {
    return null;
  }
}

export async function buildIndex(
  client: PublicClient,
  factories: FactoryConfig[],
  opts: { tapebook?: Address | null; claims?: Address | null } = {},
): Promise<Snapshot> {
  const errors: string[] = [];
  const block = await client.getBlock({ blockTag: 'latest' });
  const blockNumber = block.number;
  const chainId = await client.getChainId();
  const rd = (calls: Call[], batch = INDEX.batch) =>
    readMany(client, calls, { blockNumber, batch, concurrency: INDEX.concurrency, errors });

  // Claims first: it names the Tapebook processor, which marks miters below.
  let claims: ClaimsSnapshot | null = null;
  const claimsAddr = opts.claims ?? null;
  if (claimsAddr) {
    const [tapebook, currentImpl, conformance, count, vecCount] = await rd([
      { address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'tapebook' },
      { address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'currentImpl' },
      { address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'conformance' },
      { address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'claimCount' },
      { address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'conformanceCount' },
    ]);
    const n = count === null ? 0 : Number(count);
    const raw = await rd(
      Array.from({ length: n }, (_, i) => ({ address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'getClaim', args: [BigInt(i + 1)] })),
    );
    const list: IndexedClaim[] = [];
    raw.forEach((c, i) => {
      if (!c) return;
      const v = c as Record<string, unknown>;
      list.push({
        claimId: String(i + 1),
        cpu: v.cpu as Address,
        id: String(v.id),
        specId: String(v.specId),
        miterId: String(v.miterId),
        claimant: v.claimant as Address,
        bond: String(v.bond),
        postedAt: String(v.postedAt),
        lockUntil: String(v.lockUntil),
        status: Number(v.status) as 0 | 1 | 2,
        targetHash: v.targetHash as Hex,
        nIn: Number(v.nIn),
        circuitImpl: v.circuitImpl as Address,
        breaker: v.breaker as Address,
        counterexample: v.counterexample as Hex,
      });
    });
    const vecs = await rd(
      Array.from({ length: vecCount === null ? 0 : Number(vecCount) }, (_, i) => ({
        address: claimsAddr,
        abi: tapebookClaimsAbi,
        functionName: 'conformanceVector',
        args: [BigInt(i)],
      })),
    );
    const seedIds = new Set(vecs.filter(Boolean).map((v) => String((v as unknown[])[0])));
    claims = {
      address: claimsAddr,
      tapebook: (tapebook as Address) ?? opts.tapebook ?? null,
      creator: null,
      currentImpl: (currentImpl as Address) ?? null,
      conformance: (conformance as boolean[]) ?? null,
      count: str(count),
      list,
      specs: [...seedIds].map((specId) => ({ specId, owner: zeroAddress, name: '', uri: '', seed: true })),
    };
  }
  const tapebook = claims?.tapebook ?? opts.tapebook ?? null;

  const out: Snapshot['factories'] = [];
  for (const f of factories) {
    const [cpuCount] = await rd([{ address: f.address, abi: circuitFactoryAbi, functionName: 'cpuCount' }]);
    const nCpu = cpuCount === null ? 0 : Number(cpuCount);
    const cpus = (
      await rd(Array.from({ length: nCpu }, (_, i) => ({ address: f.address, abi: circuitFactoryAbi, functionName: 'cpuAt', args: [BigInt(i)] })))
    ).filter(Boolean) as Address[];

    const per = await rd(
      cpus.flatMap((c) => [
        { address: c, abi: circuitsAbi, functionName: 'nextId' },
        { address: c, abi: circuitsAbi, functionName: 'transistors' },
      ]),
    );
    const processors: IndexedProcessor[] = cpus.map((c, i) => ({
      circuits: c,
      nextId: str(per[2 * i]),
      transistors: (per[2 * i + 1] as Address) ?? null,
      name: null,
      symbol: null,
      supplyCap: null,
      minted: null,
      mintPrice: null,
      list: [],
    }));

    const tFields = ['supplyCap', 'minted', 'mintPrice', 'cpuName', 'cpuSymbol'] as const;
    const withT = processors.filter((p) => p.transistors);
    const tv = await rd(withT.flatMap((p) => tFields.map((fn) => ({ address: p.transistors!, abi: transistorsAbi, functionName: fn }))));
    withT.forEach((p, i) => {
      const v = tv.slice(i * tFields.length, (i + 1) * tFields.length);
      p.supplyCap = str(v[0]);
      p.minted = str(v[1]);
      p.mintPrice = str(v[2]);
      p.name = (v[3] as string) ?? null;
      p.symbol = (v[4] as string) ?? null;
    });

    // Circuits: ids 1…nextId.
    const ids: [IndexedProcessor, bigint][] = [];
    for (const p of processors) for (let id = 1n; id <= BigInt(p.nextId ?? 0); id++) ids.push([p, id]);
    const info = await rd(
      ids.flatMap(([p, id]) => [
        { address: p.circuits, abi: circuitsAbi, functionName: 'circuitInfo', args: [id] },
        { address: p.circuits, abi: circuitsAbi, functionName: 'ownerOf', args: [id] },
      ]),
    );
    for (let off = 0; off < ids.length; off += INDEX.netlistChunk) {
      const slice = ids.slice(off, off + INDEX.netlistChunk);
      const nls = await readMany(
        client,
        slice.map(([p, id]) => ({ address: p.circuits, abi: circuitsAbi, functionName: 'netlist', args: [id] })),
        { blockNumber, batch: INDEX.netlistBatch, concurrency: INDEX.netlistConcurrency, errors },
      );
      slice.forEach(([p, id], j) => {
        const k = off + j;
        const ci = info[2 * k] as readonly [number, number, number, number] | null;
        const nl = nls[j] as Hex | null;
        const c: IndexedCircuit = {
          id: id.toString(),
          nIn: ci ? Number(ci[0]) : null,
          nOut: ci ? Number(ci[1]) : null,
          nState: ci ? Number(ci[2]) : null,
          gateCount: ci ? Number(ci[3]) : null,
          owner: (info[2 * k + 1] as Address) ?? null,
          hash: nl ? keccak256(nl) : null,
          size: nl ? (nl.length - 2) / 2 : null,
        };
        if (tapebook && nl && ci && p.circuits.toLowerCase() === tapebook.toLowerCase()) c.miterOf = miterOf(nl, Number(ci[0]), tapebook);
        p.list.push(c);
      });
      // Release the dropped netlist strings between chunks; gc() is only present under --expose-gc.
      (globalThis as { gc?: () => void }).gc?.();
    }
    out.push({ label: f.label, address: f.address, cpuCount: str(cpuCount), processors });
  }

  // Registered specs: specs(id) for every circuit on the Tapebook processor.
  if (claims && tapebook) {
    const tb = out.flatMap((f) => f.processors).find((p) => p.circuits.toLowerCase() === tapebook.toLowerCase());
    if (tb) {
      const s = await rd(tb.list.map((c) => ({ address: claims!.address, abi: tapebookClaimsAbi, functionName: 'specs', args: [BigInt(c.id)] })));
      const seeds = new Set(claims.specs.map((x) => x.specId));
      claims.specs = [];
      tb.list.forEach((c, i) => {
        const v = s[i] as readonly [Address, string, string] | null;
        if (v && v[0] !== zeroAddress) claims!.specs.push({ specId: c.id, owner: v[0], name: v[1], uri: v[2], seed: seeds.has(c.id) });
      });
      if (tb.transistors) {
        const [creator] = await rd([{ address: tb.transistors, abi: transistorsAbi, functionName: 'creator' }]);
        claims.creator = (creator as Address) ?? null;
      }
    }
  }
  return {
    chainId,
    block: { number: blockNumber.toString(), timestamp: block.timestamp.toString() },
    builtAt: new Date().toISOString(),
    factories: out,
    claims,
    errors,
  };
}
