'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { Hex } from 'viem';
import { useConnection } from 'wagmi';
import { bytesToHex, hexToBytes, isCanonical, packInt, unpackInt } from '../../core/bits';
import { tapebookClaimsAbi } from '@/lib/abi';
import { publicClient } from '@/lib/chain';
import { statusOf } from '@/lib/claims';
import { CHAIN, HUNT, LIMITS, TAPEBOOK } from '@/lib/config';
import { DASH, okb } from '@/lib/format';
import { commitment, hunt, plannedCount, type HuntResult } from '@/lib/hunt';
import { useMounted } from '@/lib/hooks';
import { evalAt, useCircuit, useClaim, useCredit } from '@/lib/reads';
import { ClaimCard } from './claim-card';
import { Card, Field, Loading, PageTitle, RpcError } from './common';
import { Stepper } from './stepper';
import { TxAction } from './wallet';

function storageKey(claimId: string, account: string) {
  return `tapebook:x:${CHAIN.id}:${TAPEBOOK.claims?.toLowerCase()}:${claimId}:${account.toLowerCase()}`;
}
function loadX(claimId: string, account: string | undefined): Hex | null {
  if (!account) return null;
  try {
    return (localStorage.getItem(storageKey(claimId, account)) as Hex | null) ?? null;
  } catch {
    return null;
  }
}
function saveX(claimId: string, account: string, x: Hex) {
  try {
    localStorage.setItem(storageKey(claimId, account), x);
  } catch {
    /* storage unavailable: the reveal will need the input again */
  }
}

/** Parses "383", "0x7f0100" (canonical bytes) or "0b101…" into canonical input bytes. */
function parseInput(text: string, nIn: number): Hex | null {
  const t = text.trim();
  try {
    if (/^0x[0-9a-fA-F]*$/.test(t)) {
      const b = hexToBytes(t);
      return isCanonical(b, nIn) ? bytesToHex(b) : null;
    }
    if (/^0b[01]+$/.test(t)) return bytesToHex(packInt(BigInt(t), nIn));
    if (/^\d+$/.test(t)) return bytesToHex(packInt(BigInt(t), nIn));
  } catch {
    return null;
  }
  return null;
}

export function HuntView({ claimId: idParam }: { claimId: string }) {
  const claimId = /^\d+$/.test(idParam) ? BigInt(idParam) : null;
  const q = useClaim(claimId);
  const claim = q.data?.claim ?? null;
  const target = useCircuit(claim?.cpu ?? null, claim ? BigInt(claim.id) : null);
  const nOut = target.data?.kind === 'ok' ? (target.data.info?.nOut ?? null) : null;
  const { address } = useConnection();
  const credit = useCredit(address);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ searched: number; batchSize: number; block: bigint } | null>(null);
  const [result, setResult] = useState<HuntResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [found, setFound] = useState<Hex | null>(null);
  const [manual, setManual] = useState('');
  const [manualMsg, setManualMsg] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // A counterexample committed earlier from this browser survives a reload.
  const mounted = useMounted();
  const savedX = mounted && claim ? loadX(claim.claimId, address) : null;
  const x = found ?? savedX;

  const outputs = useQuery({
    queryKey: ['hunt-outputs', claim?.claimId, x],
    enabled: !!claim && !!x && !!TAPEBOOK.circuits,
    queryFn: async () => ({
      target: await evalAt(claim!.cpu, BigInt(claim!.id), x!),
      spec: await evalAt(TAPEBOOK.circuits!, BigInt(claim!.specId), x!),
    }),
  });

  const h = claim && x && address ? commitment(BigInt(claim.claimId), x, address) : null;
  const commitState = useQuery({
    queryKey: ['commit', h],
    enabled: !!h && !!TAPEBOOK.claims,
    refetchInterval: 2000,
    queryFn: async () => {
      const c = publicClient();
      const [cb, bn] = await Promise.all([
        c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'commitBlock', args: [h!] }),
        c.getBlockNumber(),
      ]);
      return { commitBlock: cb, block: bn };
    },
  });

  if (claimId === null) return <PageTitle eyebrow="Hunt" title="No such claim" />;
  if (!TAPEBOOK.claims) return <p className="panel-warning">No TapebookClaims contract is configured.</p>;
  if (q.isLoading) return <Loading />;
  if (q.error) return <RpcError error={q.error} />;
  if (!claim) return <PageTitle eyebrow="Hunt" title="No such claim">There is no claim {claimId.toString()} ({q.data?.count.toString()} claims exist).</PageTitle>;

  const status = statusOf(claim);
  const total = plannedCount(claim.nIn);

  async function run() {
    setRunning(true);
    setResult(null);
    setRunError(null);
    abort.current = new AbortController();
    try {
      const r = await hunt({ client: publicClient(), claims: TAPEBOOK.claims!, claimId: BigInt(claim!.claimId), nIn: claim!.nIn, signal: abort.current.signal, onProgress: setProgress });
      setResult(r);
      if (r.found) setFound(r.found);
    } catch (e) {
      setRunError((e as Error).message.split('\n')[0]);
    } finally {
      setRunning(false);
    }
  }

  async function check() {
    setManualMsg(null);
    const x = parseInput(manual, claim!.nIn);
    if (!x) return setManualMsg(`Not a valid input for ${claim!.nIn} pins (integer, 0b…, or canonical hex of ${Math.ceil(claim!.nIn / 8)} bytes).`);
    try {
      const d = await publicClient().readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'differs', args: [BigInt(claim!.claimId), x] });
      if (d) setFound(x);
      else setManualMsg(`Target and spec agree on ${x}.`);
    } catch (e) {
      setManualMsg((e as Error).message.split('\n')[0]);
    }
  }

  const cs = commitState.data;
  const committed = !!cs && cs.commitBlock > 0n;
  const revealable = committed && cs!.block >= cs!.commitBlock + LIMITS.revealDelayBlocks;
  const n = nOut ?? 0;
  const show = (out: Hex | null | undefined) => (out ? `${unpackInt(hexToBytes(out), n)}` : DASH);

  return (
    <>
      <PageTitle eyebrow={`Hunt · claim ${claim.claimId}`} title="Find one breaking input." />

      <ClaimCard claim={claim} currentImpl={q.data?.currentImpl} target={target.data?.kind === 'ok' ? target.data.info : null} showTarget onHuntPage />

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <span className="card-title">Search</span>
          <p className="card-desc">
            {total !== null ? `Full sweep of ${total.toLocaleString('en-US')} inputs.` : `Patterns, then ${HUNT.randomBudget.toLocaleString('en-US')} random inputs.`} Checked on chain by TapeOut’s eval.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={run} disabled={running}>
              {running ? 'Searching…' : 'Run hunt'}
            </button>
            {running && (
              <button className="btn btn-ghost" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            )}
          </div>
          {progress && (
            <p className="mono text-[length:var(--text-xs)] text-fg-secondary">
              {total !== null ? `swept ${progress.searched.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}` : `searched ${progress.searched.toLocaleString('en-US')} inputs`} at block{' '}
              {progress.block.toString()} · batch {progress.batchSize}
            </p>
          )}
          {runError && <p className="panel-danger text-[length:var(--text-sm)]">Search stopped: {runError}</p>}
          {result && !result.found && (
            <p className="panel-warning text-[length:var(--text-sm)]">
              {result.aborted
                ? `Stopped after ${result.searched.toLocaleString('en-US')} inputs at block ${result.block}.`
                : result.exhaustive
                  ? `Swept ${result.searched.toLocaleString('en-US')} of ${result.total!.toLocaleString('en-US')} at block ${result.block}, none found.`
                  : `Searched ${result.searched.toLocaleString('en-US')} inputs at block ${result.block}, none found.`}{' '}
              This is a local observation, not a proof.
            </p>
          )}
          <div className="flex flex-col gap-2 border-t border-line-muted pt-4">
            <span className="eyebrow-sm">Or check your own input</span>
            <div className="flex gap-2">
              <input className="input mono flex-1" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="integer, 0b… or canonical hex" />
              <button className="btn btn-ghost" onClick={check}>
                Check
              </button>
            </div>
            {manualMsg && <p className="text-[length:var(--text-xs)] text-fg-secondary">{manualMsg}</p>}
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <span className="card-title">Counterexample</span>
          {!x ? (
            <p className="card-desc">None yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Field label="x">
                  <span className="mono">{x}</span>
                  <span className="block text-[length:var(--text-xs)]">= {unpackInt(hexToBytes(x), claim.nIn).toString()}</span>
                </Field>
                <Field label="Target output">{outputs.isLoading ? '…' : <span className="mono">{show(outputs.data?.target)}</span>}</Field>
                <Field label="Spec output">{outputs.isLoading ? '…' : <span className="mono">{show(outputs.data?.spec)}</span>}</Field>
              </div>
              {status !== 'OPEN' ? (
                <p className="card-desc">The claim is no longer open.</p>
              ) : (
                <Stepper
                  steps={[
                    {
                      title: 'Commit',
                      done: committed,
                      detail: 'Records keccak256(claimId, x, your address). The input stays private until you challenge, and nobody else can use your commitment.',
                      action: h && (
                        <div onClickCapture={() => address && saveX(claim.claimId, address, x)}>
                          <TxAction req={{ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'commit', args: [h], label: `commit(${h.slice(0, 10)}…)` }} button="Commit" onConfirmed={() => commitState.refetch()} />
                        </div>
                      ),
                    },
                    {
                      title: 'Wait one block',
                      done: revealable,
                      detail: cs && committed ? `Committed in block ${cs.commitBlock}; current block ${cs.block}.` : undefined,
                      action: <p className="text-[length:var(--text-xs)] text-fg-muted">Waiting for the next block…</p>,
                    },
                    {
                      title: 'Challenge',
                      done: false,
                      detail: `TapeOut evaluates the miter on x; if it returns 1 the claim is BROKEN and ${okb(claim.bond)} is credited to you.`,
                      action: (
                        <TxAction
                          req={{ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'challenge', args: [BigInt(claim.claimId), x], label: `challenge(${claim.claimId}, ${x})` }}
                          button="Challenge"
                          onConfirmed={() => {
                            q.refetch();
                            credit.refetch();
                          }}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </>
          )}
          <p className="text-[length:var(--text-xs)] text-fg-muted">
            <Link className="underline" href={`/c/${claim.cpu}/${claim.id}`}>
              Target circuit page
            </Link>
          </p>
        </Card>
      </section>
    </>
  );
}
