// Claim status vocabulary (PRD section 11): UNCLAIMED, OPEN · bond X, BROKEN.
// Never "verified", "proven" or "safe".
import type { Address } from 'viem';
import type { IndexedClaim, Snapshot } from './indexer';

export type Status = 'UNCLAIMED' | 'OPEN' | 'BROKEN';

export function statusOf(c: Pick<IndexedClaim, 'status'> | null | undefined): Status {
  if (!c) return 'UNCLAIMED';
  return c.status === 2 ? 'BROKEN' : c.status === 1 ? 'OPEN' : 'UNCLAIMED';
}

/** Claims about (cpu, id), newest first. */
export function claimsFor(snapshot: Snapshot | null | undefined, cpu: Address | string, id: string | bigint): IndexedClaim[] {
  if (!snapshot?.claims) return [];
  const k = cpu.toLowerCase();
  return snapshot.claims.list.filter((c) => c.cpu.toLowerCase() === k && c.id === String(id)).sort((a, b) => Number(b.claimId) - Number(a.claimId));
}

/** The status a circuit shows in the Book: any open claim → OPEN, else any broken → BROKEN. */
export function circuitStatus(claims: IndexedClaim[]): { status: Status; claim: IndexedClaim | null } {
  const open = claims.find((c) => c.status === 1);
  if (open) return { status: 'OPEN', claim: open };
  const broken = claims.find((c) => c.status === 2);
  if (broken) return { status: 'BROKEN', claim: broken };
  return { status: 'UNCLAIMED', claim: null };
}

export function logicChanged(c: Pick<IndexedClaim, 'circuitImpl'>, currentImpl: string | null | undefined): boolean {
  return !!currentImpl && c.circuitImpl.toLowerCase() !== currentImpl.toLowerCase();
}
