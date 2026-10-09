'use client';

// UI banner for TapeOut upgrades (PRD section 15, measure 7).
import { primaryVersions, useVersions } from '@/lib/api';
import { DASH, shortAddr } from '@/lib/format';
import { Addr } from './common';

export function VersionBanner() {
  const { data, error, isLoading } = useVersions();
  const v = primaryVersions(data);
  if (isLoading) return <p className="text-[length:var(--text-xs)] text-fg-muted">Reading TapeOut logic version…</p>;
  if (error || !v)
    return <p className="text-[length:var(--text-xs)] text-fg-muted">TapeOut logic version: {DASH} (RPC error)</p>;
  const changes = v.history.filter((h) => h.kind === 'circuitImpl');
  const conf = v.claims?.conformance;
  const confOk = conf ? conf.filter(Boolean).length : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-xs)] text-fg-secondary">
      <span className="eyebrow-sm">TapeOut logic</span>
      <span title={v.circuitImpl ?? ''}>
        circuits <Addr a={v.circuitImpl} />
      </span>
      {v.circuitImplSince && (
        <span className={changes.length > 1 ? 'badge badge-warning' : 'badge badge-unclaimed'}>
          {changes.length > 1 ? 'changed' : 'installed'} at block {v.circuitImplSince}
        </span>
      )}
      {conf && (
        <span className={confOk === conf.length ? 'badge badge-open' : 'badge badge-broken'}>
          conformance {confOk}/{conf.length}
        </span>
      )}
      {v.isSealed === true ? (
        <span className="badge badge-open">sealed</span>
      ) : v.isSealed === false ? (
        <span className="badge badge-warning" title="The factory owner can still replace circuit logic for all processors">
          upgradeable (not sealed)
        </span>
      ) : null}
      <span className="text-fg-muted">at block {v.block.number}</span>
    </div>
  );
}

export function versionLine(v: ReturnType<typeof primaryVersions>): string {
  if (!v) return `Logic version ${DASH}`;
  return `Logic ${shortAddr(v.circuitImpl)} · block ${v.block.number}${v.isSealed ? ' · sealed' : ''}`;
}
