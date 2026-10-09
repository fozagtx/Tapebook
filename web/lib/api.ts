'use client';
// Client-side access to the cached snapshots.
import { useQuery } from '@tanstack/react-query';
import type { Snapshot } from './indexer';
import type { Versions } from './versions';

export type IndexResponse = (Snapshot & { ok: true }) | { ok: false; error: string; block: null; factories: []; claims: null; errors: string[]; builtAt: string; chainId: null };
export type VersionsEntry = ({ ok: true; label: string } & Versions) | { ok: false; label: string; factory: string; error: string };
export type VersionsResponse = { builtAt: string; factories: VersionsEntry[] };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export function useIndex() {
  return useQuery({ queryKey: ['api-index'], queryFn: () => getJson<IndexResponse>('/api/index'), staleTime: 60_000 });
}

export function useVersions() {
  return useQuery({ queryKey: ['api-versions'], queryFn: () => getJson<VersionsResponse>('/api/versions'), staleTime: 60_000 });
}

/** The first factory's watcher result, when it could be read. */
export function primaryVersions(v: VersionsResponse | undefined): (Versions & { ok: true; label: string }) | null {
  const f = v?.factories[0];
  return f && f.ok ? f : null;
}
