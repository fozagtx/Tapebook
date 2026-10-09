'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Status } from '@/lib/claims';
import { DASH, explorerAddress, explorerTx, okb, shortAddr } from '@/lib/format';
import { cn } from '@/lib/utils';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-card inline-flex items-center gap-1"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label={label ?? 'Copy'}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {label ?? (done ? 'Copied' : 'Copy')}
    </button>
  );
}

export function Addr({ a, full, link = true }: { a: string | null | undefined; full?: boolean; link?: boolean }) {
  if (!a) return <span>{DASH}</span>;
  const href = link ? explorerAddress(a) : null;
  const text = full ? a : shortAddr(a);
  return (
    <span className="mono inline-flex items-center gap-1" title={a}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="underline decoration-[var(--color-border-strong)] underline-offset-2">
          {text}
        </a>
      ) : (
        text
      )}
    </span>
  );
}

export function TxLink({ hash }: { hash: string }) {
  const href = explorerTx(hash);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 underline">
      {shortAddr(hash)} <ExternalLink size={12} />
    </a>
  ) : (
    <span className="mono">{shortAddr(hash)}</span>
  );
}

export function StatusBadge({ status, bond }: { status: Status; bond?: string | bigint | null }) {
  if (status === 'OPEN') return <span className="badge badge-open">OPEN · bond {okb(bond ?? 0n)}</span>;
  if (status === 'BROKEN') return <span className="badge badge-broken">BROKEN</span>;
  return <span className="badge badge-unclaimed">UNCLAIMED</span>;
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="eyebrow-sm">{label}</span>
      <span className="text-[length:var(--text-sm)] text-fg">{children ?? DASH}</span>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function Loading({ what = 'Reading the chain' }: { what?: string }) {
  return <p className="card-desc">{what}…</p>;
}

export function RpcError({ error }: { error: unknown }) {
  return (
    <div className="panel-danger text-[length:var(--text-sm)]">
      <strong>RPC error.</strong> The chain could not be read, so values are shown as {DASH}.{' '}
      <span className="mono opacity-80">{error instanceof Error ? error.message.split('\n')[0] : String(error ?? '')}</span>
    </div>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-2">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 className="font-serif text-[length:var(--text-4xl)] leading-[var(--leading-tight)] text-accent">{title}</h1>
      {children && <div className="card-desc max-w-[var(--max-width-prose)]">{children}</div>}
    </header>
  );
}
