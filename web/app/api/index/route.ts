// The Book snapshot: every processor and circuit on the configured TapeOut factories, plus
// Tapebook claims and specs, read at one block. Served from the in-process cache
// (lib/api-cache.ts): first call computes, later calls are instant and refresh in the
// background once stale. Rebuilt at most every 10 minutes.
import { indexCache } from '@/lib/api-cache';

export const maxDuration = 60;
// Computed at request time, not at build, so the build never depends on the RPC.
// Cache-Control carries the 10-minute TTL.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await indexCache.get();
    return Response.json(
      { ok: true, ...snapshot },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600', 'X-Snapshot-Age': String(indexCache.age() ?? 0) } },
    );
  } catch (e) {
    // RPC unavailable: report it; the UI renders every value as "—".
    return Response.json({
      ok: false,
      error: (e as Error).message.split('\n')[0],
      chainId: null,
      block: null,
      builtAt: new Date().toISOString(),
      factories: [],
      claims: null,
      errors: [],
    });
  }
}
