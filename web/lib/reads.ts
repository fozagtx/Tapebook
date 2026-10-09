'use client';
// Live reads in the browser (public RPC). Unreadable values come back as null.
import { useQuery } from '@tanstack/react-query';
import { zeroAddress, type Address, type Hex } from 'viem';
import { circuitFactoryAbi, circuitsAbi, tapebookClaimsAbi, transistorsAbi } from './abi';
import { publicClient } from './chain';
import { FACTORIES, TAPEBOOK } from './config';
import type { IndexedClaim } from './indexer';

export type CircuitInfo = { nIn: number; nOut: number; nState: number; gateCount: number };

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export async function readCircuit(cpu: Address, id: bigint) {
  const c = publicClient();
  const factoryHits = await Promise.all(
    FACTORIES.map((f) => safe(c.readContract({ address: f.address, abi: circuitFactoryAbi, functionName: 'isCPU', args: [cpu] }))),
  );
  if (factoryHits.every((h) => h === null)) throw new Error('could not reach the TapeOut factory');
  const factory = FACTORIES.find((_, i) => factoryHits[i] === true) ?? null;
  if (!factory) return { kind: 'not-a-processor' as const };
  const nextId = await c.readContract({ address: cpu, abi: circuitsAbi, functionName: 'nextId' });
  if (id < 1n || id > nextId) return { kind: 'out-of-range' as const, nextId, factory };
  const [info, owner, netlist, transistors] = await Promise.all([
    safe(c.readContract({ address: cpu, abi: circuitsAbi, functionName: 'circuitInfo', args: [id] })),
    safe(c.readContract({ address: cpu, abi: circuitsAbi, functionName: 'ownerOf', args: [id] })),
    safe(c.readContract({ address: cpu, abi: circuitsAbi, functionName: 'netlist', args: [id] })),
    safe(c.readContract({ address: cpu, abi: circuitsAbi, functionName: 'transistors' })),
  ]);
  const [name, symbol] = transistors
    ? await Promise.all([
        safe(c.readContract({ address: transistors, abi: transistorsAbi, functionName: 'cpuName' })),
        safe(c.readContract({ address: transistors, abi: transistorsAbi, functionName: 'cpuSymbol' })),
      ])
    : [null, null];
  return {
    kind: 'ok' as const,
    factory,
    nextId,
    info: info ? ({ nIn: info[0], nOut: info[1], nState: info[2], gateCount: info[3] } as CircuitInfo) : null,
    owner: owner as Address | null,
    netlist: netlist as Hex | null,
    transistors: transistors as Address | null,
    name: name as string | null,
    symbol: symbol as string | null,
  };
}

export function useCircuit(cpu: Address | null, id: bigint | null) {
  return useQuery({
    queryKey: ['circuit', cpu, id?.toString()],
    queryFn: () => readCircuit(cpu!, id!),
    enabled: !!cpu && id !== null,
  });
}

function toClaim(i: bigint, v: Record<string, unknown>): IndexedClaim {
  return {
    claimId: i.toString(),
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
  };
}

/** Every claim, read live (claims are few; one multicall per 200). */
export function useClaims() {
  return useQuery({
    queryKey: ['claims-live'],
    enabled: !!TAPEBOOK.claims,
    queryFn: async () => {
      const c = publicClient();
      const claims = TAPEBOOK.claims!;
      const [count, currentImpl] = await Promise.all([
        c.readContract({ address: claims, abi: tapebookClaimsAbi, functionName: 'claimCount' }),
        c.readContract({ address: claims, abi: tapebookClaimsAbi, functionName: 'currentImpl' }),
      ]);
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
      const res = await c.multicall({
        contracts: ids.map((i) => ({ address: claims, abi: tapebookClaimsAbi, functionName: 'getClaim', args: [i] }) as const),
        allowFailure: false,
      });
      return { list: res.map((v, k) => toClaim(ids[k], v as unknown as Record<string, unknown>)), currentImpl, count };
    },
  });
}

export function useClaim(claimId: bigint | null) {
  return useQuery({
    queryKey: ['claim', claimId?.toString()],
    enabled: !!TAPEBOOK.claims && claimId !== null,
    queryFn: async () => {
      const c = publicClient();
      const [v, currentImpl, count] = await Promise.all([
        c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'getClaim', args: [claimId!] }),
        c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'currentImpl' }),
        c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'claimCount' }),
      ]);
      const claim = toClaim(claimId!, v as unknown as Record<string, unknown>);
      return { claim: claim.status === 0 ? null : claim, currentImpl, count };
    },
  });
}

export function useSpec(specId: bigint | null) {
  return useQuery({
    queryKey: ['spec', specId?.toString()],
    enabled: !!TAPEBOOK.claims && !!TAPEBOOK.circuits && specId !== null,
    queryFn: async () => {
      const c = publicClient();
      const [s, info] = await Promise.all([
        c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'specs', args: [specId!] }),
        safe(c.readContract({ address: TAPEBOOK.circuits!, abi: circuitsAbi, functionName: 'circuitInfo', args: [specId!] })),
      ]);
      return {
        owner: s[0] === zeroAddress ? null : s[0],
        name: s[1],
        uri: s[2],
        info: info ? ({ nIn: info[0], nOut: info[1], nState: info[2], gateCount: info[3] } as CircuitInfo) : null,
      };
    },
  });
}

export function useCredit(account: Address | undefined) {
  return useQuery({
    queryKey: ['credit', account],
    enabled: !!TAPEBOOK.claims && !!account,
    queryFn: () => publicClient().readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'credit', args: [account!] }),
  });
}

/** eval(id, x) on a processor; null when it reverts. */
export async function evalAt(cpu: Address, id: bigint, x: Hex, blockNumber?: bigint): Promise<Hex | null> {
  return safe(publicClient().readContract({ address: cpu, abi: circuitsAbi, functionName: 'eval', args: [id, x], blockNumber }));
}
