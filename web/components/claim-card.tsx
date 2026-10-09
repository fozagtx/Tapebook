'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { keccak256, parseEther, type Address, type Hex } from 'viem';
import { useConnection } from 'wagmi';
import { hexToBytes, unpackInt } from '../../contracts/core/bits';
import { tapebookClaimsAbi } from '@/lib/abi';
import { logicChanged, statusOf } from '@/lib/claims';
import { CHAIN, LIMITS, TAPEBOOK } from '@/lib/config';
import { DASH, dateTime, duration, okb } from '@/lib/format';
import type { IndexedClaim } from '@/lib/indexer';
import { specLabel } from '@/lib/labels';
import { useNow } from '@/lib/hooks';
import { evalAt, useCredit, useSpec, type CircuitInfo } from '@/lib/reads';
import { Addr, CopyButton, Field, StatusBadge } from './common';
import { TxAction } from './wallet';

function bitsOf(out: Hex | null, n: number) {
  if (!out) return DASH;
  const v = unpackInt(hexToBytes(out), n);
  return `${v} (0b${v.toString(2).padStart(n, '0')})`;
}

export function BrokenDetail({ claim, target, nOut }: { claim: IndexedClaim; target: CircuitInfo | null; nOut: number | null }) {
  const x = claim.counterexample;
  const outs = useQuery({
    queryKey: ['broken-outputs', claim.claimId],
    queryFn: async () => ({
      target: await evalAt(claim.cpu, BigInt(claim.id), x),
      spec: TAPEBOOK.circuits ? await evalAt(TAPEBOOK.circuits, BigInt(claim.specId), x) : null,
    }),
  });
  const n = nOut ?? target?.nOut ?? 0;
  const snippet = `import { createPublicClient, http, parseAbi } from 'viem'
import { ${CHAIN.id === 196 ? 'xLayer' : 'foundry'} } from 'viem/chains'

const client = createPublicClient({ chain: ${CHAIN.id === 196 ? 'xLayer' : 'foundry'}, transport: http() })
const abi = parseAbi(['function eval(uint256 circuitId, bytes inputs) view returns (bytes)'])
const x = '${x}'

const target = await client.readContract({ address: '${claim.cpu}', abi, functionName: 'eval', args: [${claim.id}n, x] })
const spec = await client.readContract({ address: '${TAPEBOOK.circuits ?? '0x…'}', abi, functionName: 'eval', args: [${claim.specId}n, x] })
console.log(target, spec) // they differ`;
  return (
    <div className="panel-danger flex flex-col gap-3 text-[length:var(--text-sm)]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Counterexample x">
          <span className="mono">{x}</span>
          <span className="block text-[length:var(--text-xs)]">= {claim.nIn > 0 ? unpackInt(hexToBytes(x), claim.nIn).toString() : '0'}</span>
        </Field>
        <Field label="Target output">{outs.isLoading ? '…' : <span className="mono">{bitsOf(outs.data?.target ?? null, n)}</span>}</Field>
        <Field label="Spec output">{outs.isLoading ? '…' : <span className="mono">{bitsOf(outs.data?.spec ?? null, n)}</span>}</Field>
      </div>
      <div className="text-[length:var(--text-xs)]">
        Broken by <Addr a={claim.breaker} />. Reproduce both outputs with TapeOut’s own eval:
      </div>
      <pre className="mono overflow-x-auto rounded-[var(--radius-sm)] bg-bg-surface p-3 text-[length:var(--text-xs)] text-fg">{snippet}</pre>
      <div>
        <CopyButton text={snippet} label="Copy viem call" />
      </div>
    </div>
  );
}

export function ClaimCard({
  claim,
  currentImpl,
  target,
  targetNetlist,
  showTarget,
  onHuntPage,
}: {
  claim: IndexedClaim;
  currentImpl: string | null | undefined;
  target?: CircuitInfo | null;
  targetNetlist?: Hex | null;
  showTarget?: boolean;
  onHuntPage?: boolean;
}) {
  const { address } = useConnection();
  const spec = useSpec(BigInt(claim.specId));
  const credit = useCredit(address);
  const [topUp, setTopUp] = useState('');
  const status = statusOf(claim);
  const now = useNow();
  const lockLeft = Number(claim.lockUntil) - now;
  const changed = logicChanged(claim, currentImpl);
  const netlistChanged = targetNetlist ? keccak256(targetNetlist) !== claim.targetHash : false;
  const mine = address && address.toLowerCase() === claim.claimant.toLowerCase();

  let topUpWei: bigint | null = null;
  try {
    topUpWei = topUp ? parseEther(topUp) : null;
  } catch {
    topUpWei = null;
  }
  const claimsAddr = TAPEBOOK.claims as Address;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="card-title">Claim {claim.claimId}</span>
          <StatusBadge status={status} bond={claim.bond} />
          {changed && <span className="badge badge-warning">logic changed since posting</span>}
          {netlistChanged && <span className="badge badge-warning">netlist differs from posting</span>}
        </div>
        {status === 'OPEN' && !onHuntPage && (
          <Link href={`/hunt/${claim.claimId}`} className="btn btn-primary">
            Hunt for a counterexample
          </Link>
        )}
      </div>

      <p className="card-desc">
        “{showTarget ? `Circuit #${claim.id} on ${claim.cpu.slice(0, 10)}…` : 'This circuit'} behaves exactly like spec #{claim.specId} on every input.”
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Spec">
          {spec.isLoading ? (
            '…'
          ) : (
            <span className="flex flex-col gap-1">
              <span>
                {spec.data?.name || `#${claim.specId}`}{' '}
                {TAPEBOOK.circuits && (
                  <Link className="underline text-[length:var(--text-xs)]" href={`/c/${TAPEBOOK.circuits}/${claim.specId}`}>
                    #{claim.specId}
                  </Link>
                )}
              </span>
              <SpecProvenance specId={claim.specId} owner={spec.data?.owner ?? null} />
              {spec.data?.uri && (
                <a className="text-[length:var(--text-xs)] underline" href={spec.data.uri} target="_blank" rel="noreferrer">
                  source
                </a>
              )}
              <span className="text-[length:var(--text-xs)] text-fg-muted">
                owner <Addr a={spec.data?.owner} />
              </span>
            </span>
          )}
        </Field>
        <Field label="Claimant">
          <Addr a={claim.claimant} />
        </Field>
        <Field label="Posted">
          {dateTime(claim.postedAt)}
          <span className="block text-[length:var(--text-xs)] text-fg-muted">{duration(now - Number(claim.postedAt))} ago</span>
        </Field>
        <Field label="Lock ends">
          {Number(claim.lockUntil) <= Number(claim.postedAt) ? 'no lock' : dateTime(claim.lockUntil)}
          {status === 'OPEN' && BigInt(claim.bond) > 0n && (
            <span className="block text-[length:var(--text-xs)] text-fg-muted">
              {lockLeft > 0 ? `${duration(lockLeft)} left` : 'unlocked: the claimant can take the bond back'}
            </span>
          )}
        </Field>
        <Field label="Miter">
          {TAPEBOOK.circuits ? (
            <Link className="underline" href={`/c/${TAPEBOOK.circuits}/${claim.miterId}`}>
              #{claim.miterId}
            </Link>
          ) : (
            `#${claim.miterId}`
          )}
        </Field>
        <Field label="Logic at posting">
          <Addr a={claim.circuitImpl} />
        </Field>
        <Field label="Target netlist hash">
          <span className="mono text-[length:var(--text-xs)]">{claim.targetHash.slice(0, 18)}…</span>
        </Field>
        <Field label="Inputs">{claim.nIn} pins</Field>
      </div>

      {status === 'BROKEN' && <BrokenDetail claim={claim} target={target ?? null} nOut={target?.nOut ?? null} />}

      {mine && status === 'OPEN' && (
        <div className="flex flex-col gap-4 border-t border-line-muted pt-4">
          <span className="eyebrow-sm">Your claim</span>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-[length:var(--text-sm)]">Add to the bond (total at most {okb(LIMITS.maxBond)})</span>
              <input className="input" placeholder="OKB" value={topUp} onChange={(e) => setTopUp(e.target.value)} inputMode="decimal" />
              <TxAction
                req={topUpWei ? { address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'topUp', args: [BigInt(claim.claimId)], value: topUpWei, label: `topUp(${claim.claimId})` } : null}
                button="Top up"
                disabled={!topUpWei || BigInt(claim.bond) + (topUpWei ?? 0n) > LIMITS.maxBond}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[length:var(--text-sm)]">
                Take the bond back ({okb(claim.bond)}).{' '}
                {lockLeft > 0 && !changed ? `Locked for ${duration(lockLeft)}.` : changed ? 'Allowed early: TapeOut logic changed since posting.' : 'The lock has ended.'} The claim
                stays open.
              </span>
              <TxAction
                req={{ address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'reclaimBond', args: [BigInt(claim.claimId)], label: `reclaimBond(${claim.claimId})` }}
                button="Reclaim bond"
                disabled={BigInt(claim.bond) === 0n || (lockLeft > 0 && !changed)}
              />
            </div>
          </div>
        </div>
      )}
      {address && (credit.data ?? 0n) > 0n && (
        <div className="flex flex-col gap-2 border-t border-line-muted pt-4">
          <span className="text-[length:var(--text-sm)]">You have {okb(credit.data!)} to withdraw from TapebookClaims.</span>
          <TxAction req={{ address: claimsAddr, abi: tapebookClaimsAbi, functionName: 'withdraw', label: 'withdraw()' }} button="Withdraw" onConfirmed={() => credit.refetch()} />
        </div>
      )}
    </div>
  );
}

/** "Tapebook seed spec" or "third-party spec", from the conformance vectors stored at deploy. */
export function SpecProvenance({ specId, owner }: { specId: string; owner: string | null }) {
  const seeds = useQuery({
    queryKey: ['seed-specs'],
    enabled: !!TAPEBOOK.claims,
    queryFn: async () => {
      const { publicClient } = await import('@/lib/chain');
      const c = publicClient();
      const n = await c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'conformanceCount' });
      const vs = await Promise.all(
        Array.from({ length: Number(n) }, (_, i) => c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'conformanceVector', args: [BigInt(i)] })),
      );
      return new Set(vs.map((v) => v[0].toString()));
    },
    staleTime: Infinity,
  });
  const text = !owner ? specLabel(null) : specLabel({ seed: !!seeds.data?.has(specId) });
  return <span className={`tag ${seeds.data?.has(specId) ? 'tag-format' : 'tag-both'} w-fit`}>{text}</span>;
}
