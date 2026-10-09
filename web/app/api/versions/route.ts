// Version watcher: TapeOut logic in force, sealed flag, fees, Tapebook's conformance check and
// the upgrade / seal / fee-change history from the chain's event logs. Served from the
// in-process cache (lib/api-cache.ts); rebuilt at most every 10 minutes.
import { versionsCache } from '@/lib/api-cache';

export const maxDuration = 60;
// Computed at request time, not at build, so the build never depends on the RPC.
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await versionsCache.get();
  return Response.json(snapshot, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600', 'X-Snapshot-Age': String(versionsCache.age() ?? 0) },
  });
}
