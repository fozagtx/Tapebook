'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useIndex } from '@/lib/api';
import { circuitStatus, claimsFor } from '@/lib/claims';
import { DASH, dateTime, explorerBlock, num, okb, shortAddr } from '@/lib/format';
import type { IndexedCircuit, IndexedProcessor, Snapshot } from '@/lib/indexer';
import { labelFor } from '@/lib/labels';
import { Addr, Loading, PageTitle, RpcError, StatusBadge } from './common';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'claimed', label: 'Claimed' },
  { key: 'open', label: 'Open' },
  { key: 'broken', label: 'Broken' },
  { key: 'tapebook', label: 'Tapebook processor' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

function rowsOf(s: Snapshot, p: IndexedProcessor, filter: FilterKey, q: string, copies: Map<string, IndexedCircuit & { cpu: string }>) {
  const ql = q.trim().toLowerCase();
  const pMatch = !ql || [p.name, p.symbol, p.circuits].some((v) => v?.toLowerCase().includes(ql));
  return p.list
    .map((c) => {
      const claims = claimsFor(s, p.circuits, c.id);
      const st = circuitStatus(claims);
      const first = c.hash ? copies.get(c.hash) : undefined;
      const copyOf = first && !(first.cpu === p.circuits && first.id === c.id) ? first : null;
      return { c, claims, st, copyOf, label: labelFor(s, p.circuits, c) };
    })
    .filter(({ c, claims, st }) => {
      if (filter === 'claimed' && claims.length === 0) return false;
      if (filter === 'open' && st.status !== 'OPEN') return false;
      if (filter === 'broken' && !claims.some((x) => x.status === 2)) return false;
      if (pMatch) return true;
      return [c.id, `#${c.id}`, c.owner ?? '', c.hash ?? ''].some((v) => v.toLowerCase() === ql || (ql.length > 6 && v.toLowerCase().includes(ql)));
    });
}

export function Book() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, error, isLoading } = useIndex();
  const [q, setQ] = useState('');
  const filter = (FILTERS.find((f) => f.key === params.get('status'))?.key ?? 'all') as FilterKey;

  const snap = data?.ok ? data : null;
  const copies = useMemo(() => {
    const m = new Map<string, IndexedCircuit & { cpu: string }>();
    snap?.factories.forEach((f) => f.processors.forEach((p) => p.list.forEach((c) => c.hash && !m.has(c.hash) && m.set(c.hash, { ...c, cpu: p.circuits }))));
    return m;
  }, [snap]);
  const copyCount = useMemo(() => {
    const m = new Map<string, number>();
    snap?.factories.forEach((f) => f.processors.forEach((p) => p.list.forEach((c) => c.hash && m.set(c.hash, (m.get(c.hash) ?? 0) + 1))));
    return m;
  }, [snap]);

  const tb = snap?.claims?.tapebook?.toLowerCase();
  return (
    <>
      <PageTitle eyebrow="The Book" title="Every TapeOut circuit, and what is claimed about it.">
        A snapshot of every processor and circuit on TapeOut’s factory, read through Multicall3 at one block and rebuilt at most every 10 minutes.
        Circuit pages re-read the chain live.
      </PageTitle>
      {isLoading && <Loading what="Reading the Book" />}
      {error && <RpcError error={error} />}
      {data && !data.ok && <RpcError error={data.error} />}
      {snap && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[length:var(--text-xs)] text-fg-muted">
            <span>
              Snapshot at block{' '}
              {explorerBlock(snap.block.number) ? (
                <a className="underline" href={explorerBlock(snap.block.number)!} target="_blank" rel="noreferrer">
                  {snap.block.number}
                </a>
              ) : (
                snap.block.number
              )}{' '}
              ({dateTime(snap.block.timestamp)})
            </span>
            {snap.errors.length > 0 && <span className="badge badge-warning">{snap.errors.length} unreadable values shown as {DASH}</span>}
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <input className="input w-full max-w-[360px]" placeholder="Search processor, address, circuit id, owner, hash" value={q} onChange={(e) => setQ(e.target.value)} />
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip ${filter === f.key ? 'is-active' : ''}`} onClick={() => router.replace(f.key === 'all' ? '/book' : `/book?status=${f.key}`)}>
                {f.label}
              </button>
            ))}
          </div>
          {snap.factories.map((f) => (
            <section key={f.address} className="mb-10">
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <h2 className="card-title">{f.label}</h2>
                <span className="text-[length:var(--text-xs)] text-fg-muted">
                  factory <Addr a={f.address} /> · {num(f.cpuCount)} processor{f.cpuCount === '1' ? '' : 's'} · {f.processors.reduce((n, p) => n + p.list.length, 0).toLocaleString('en-US')} circuits
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {f.processors
                  .filter((p) => filter !== 'tapebook' || p.circuits.toLowerCase() === tb)
                  .map((p) => {
                    const rows = rowsOf(snap, p, filter === 'tapebook' ? 'all' : filter, q, copies);
                    if (rows.length === 0 && (q || filter !== 'all')) return null;
                    return (
                      <div key={p.circuits} className="card !p-0 overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-muted px-5 py-4">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="card-title">{p.name ?? DASH}</span>
                            <span className="text-[length:var(--text-xs)] text-fg-muted">{p.symbol ?? DASH}</span>
                            {p.circuits.toLowerCase() === tb && <span className="badge badge-unclaimed">Tapebook processor</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-xs)] text-fg-secondary">
                            <span>
                              processor <Addr a={p.circuits} />
                            </span>
                            <span>
                              minted {num(p.minted)} / {num(p.supplyCap)}
                            </span>
                            <span>{okb(p.mintPrice, 6)} per transistor</span>
                            <span>{num(p.nextId)} circuits</span>
                          </div>
                        </div>
                        {rows.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Circuit</th>
                                  <th>Pins in → out</th>
                                  <th>State</th>
                                  <th>Gates</th>
                                  <th>Bytes</th>
                                  <th>Owner</th>
                                  <th>Copies</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map(({ c, st, copyOf, label }) => (
                                  <tr key={c.id}>
                                    <td>
                                      <Link className="underline" href={`/c/${p.circuits}/${c.id}`}>
                                        #{c.id}
                                      </Link>
                                      {label && <span className="ml-2 tag tag-format">{label.text}</span>}
                                    </td>
                                    <td className="mono">
                                      {c.nIn ?? DASH} → {c.nOut ?? DASH}
                                    </td>
                                    <td className="mono">{c.nState ?? DASH}</td>
                                    <td className="mono">{c.gateCount?.toLocaleString('en-US') ?? DASH}</td>
                                    <td className="mono">{c.size?.toLocaleString('en-US') ?? DASH}</td>
                                    <td>
                                      <Addr a={c.owner} link={false} />
                                    </td>
                                    <td className="text-[length:var(--text-xs)]">
                                      {copyOf ? (
                                        <Link className="underline" href={`/c/${copyOf.cpu}/${copyOf.id}`}>
                                          copy of {shortAddr(copyOf.cpu)} #{copyOf.id}
                                        </Link>
                                      ) : c.hash && (copyCount.get(c.hash) ?? 0) > 1 ? (
                                        `${copyCount.get(c.hash)} copies`
                                      ) : (
                                        DASH
                                      )}
                                    </td>
                                    <td>
                                      <StatusBadge status={st.status} bond={st.claim?.bond} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
