'use client';
// Finds an existing circuit on the Tapebook processor with a given netlist (e.g. a miter someone
// already taped out), from the Book snapshot plus a live check of circuits newer than it.
import { keccak256, type Address, type Hex } from 'viem';
import { circuitsAbi } from './abi';
import { publicClient } from './chain';
import type { Snapshot } from './indexer';

export async function findCircuitByNetlist(processor: Address, netlist: Hex, snap: Snapshot | null, owner?: Address): Promise<bigint | null> {
  const h = keccak256(netlist);
  const c = publicClient();
  const p = snap?.factories.flatMap((f) => f.processors).find((x) => x.circuits.toLowerCase() === processor.toLowerCase());
  const fromSnap = p?.list.filter((x) => x.hash === h && (!owner || x.owner?.toLowerCase() === owner.toLowerCase())) ?? [];
  if (fromSnap.length) return BigInt(fromSnap[0].id);
  const nextId = await c.readContract({ address: processor, abi: circuitsAbi, functionName: 'nextId' });
  const start = p?.nextId ? BigInt(p.nextId) + 1n : 1n;
  const ids: bigint[] = [];
  for (let i = nextId; i >= start && ids.length < 500; i--) ids.push(i);
  if (!ids.length) return null;
  const res = await c.multicall({
    contracts: ids.flatMap((id) => [
      { address: processor, abi: circuitsAbi, functionName: 'netlist', args: [id] } as const,
      { address: processor, abi: circuitsAbi, functionName: 'ownerOf', args: [id] } as const,
    ]),
    allowFailure: true,
  });
  for (let k = ids.length - 1; k >= 0; k--) {
    const nl = res[2 * k];
    const ow = res[2 * k + 1];
    if (nl.status !== 'success' || keccak256(nl.result as Hex) !== h) continue;
    if (owner && (ow.status !== 'success' || (ow.result as string).toLowerCase() !== owner.toLowerCase())) continue;
    return ids[k];
  }
  return null;
}
