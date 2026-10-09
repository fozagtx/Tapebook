// Provenance labels for circuits on the Tapebook processor (PRD section 6).
import type { Address } from 'viem';
import type { IndexedCircuit, Snapshot } from './indexer';

export type Label = { text: string; kind: 'seed' | 'third-party' | 'miter' | 'reference' };

export function tapebookOf(s: Snapshot | null | undefined): Address | null {
  return s?.claims?.tapebook ?? null;
}

export function labelFor(s: Snapshot | null | undefined, cpu: string, c: Pick<IndexedCircuit, 'id' | 'owner' | 'miterOf'>): Label | null {
  const tb = tapebookOf(s);
  if (!s?.claims || !tb || cpu.toLowerCase() !== tb.toLowerCase()) return null;
  const spec = s.claims.specs.find((x) => x.specId === c.id);
  if (spec) return spec.seed ? { text: 'Tapebook seed spec', kind: 'seed' } : { text: 'third-party spec', kind: 'third-party' };
  if (c.miterOf) return { text: `miter: #${c.miterOf.id} vs spec #${c.miterOf.specId}`, kind: 'miter' };
  if (s.claims.creator && c.owner && c.owner.toLowerCase() === s.claims.creator.toLowerCase())
    return { text: 'Tapebook reference target', kind: 'reference' };
  return null;
}

export function specLabel(spec: { seed: boolean } | null | undefined): string {
  if (!spec) return 'unregistered spec';
  return spec.seed ? 'Tapebook seed spec' : 'third-party spec';
}
