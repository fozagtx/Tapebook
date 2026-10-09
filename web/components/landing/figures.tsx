'use client';

import { useInView, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { formatEther } from 'viem';
import StatsCounter from '@/components/ui/stats-counter';
import { useIndex } from '@/lib/api';
import { DASH } from '@/lib/format';

function Figure({ label, value, decimals = 0, visible }: { label: string; value: number | null; decimals?: number; visible: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-6">
      <span className="display-figure text-[length:var(--text-4xl)]">
        {value === null ? (
          DASH
        ) : reduce ? (
          value.toFixed(decimals)
        ) : visible ? (
          <StatsCounter value={value} duration={1.5} decimals={decimals} />
        ) : (
          <span className="invisible">{value.toFixed(decimals)}</span>
        )}
      </span>
      <span className="eyebrow-sm">{label}</span>
    </div>
  );
}

export function FiguresStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, amount: 0.4 });
  const { data, isLoading } = useIndex();
  const ok = data?.ok ? data : null;
  const circuits = ok ? ok.factories.reduce((n, f) => n + f.processors.reduce((m, p) => m + p.list.length, 0), 0) : null;
  const claims = ok?.claims?.list ?? null;
  const open = claims ? claims.filter((c) => c.status === 1) : null;
  const bonded = open ? Number(formatEther(open.reduce((s, c) => s + BigInt(c.bond), 0n))) : null;
  const broken = claims ? claims.filter((c) => c.status === 2).length : null;

  return (
    <section ref={ref} className="border-y border-line bg-bg-surface pt-20">
      <div className="container grid grid-cols-2 md:grid-cols-4">
        <Figure label="Circuits indexed" value={isLoading ? null : circuits} visible={visible} />
        <Figure label="Open claims" value={isLoading ? null : (open?.length ?? null)} visible={visible} />
        <Figure label="OKB bonded" value={isLoading ? null : bonded} decimals={3} visible={visible} />
        <Figure label="Claims broken" value={isLoading ? null : broken} visible={visible} />
      </div>
      <p className="container pb-6 text-center text-[length:var(--text-xs)] text-fg-muted">
        {ok ? `Snapshot at block ${ok.block.number}, rebuilt at most every 10 minutes.` : isLoading ? 'Reading the Book…' : `Snapshot unavailable (RPC error); figures show ${DASH}.`}
      </p>
    </section>
  );
}
