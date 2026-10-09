// The Book snapshot: every processor and circuit on the configured TapeOut factories, plus
// Tapebook claims and specs, read at one block. Rebuilt at most every 10 minutes.
import { serverClient } from '@/lib/chain';
import { FACTORIES, TAPEBOOK } from '@/lib/config';
import { buildIndex } from '@/lib/indexer';

export const maxDuration = 60;
// Computed at request time, not at build, so the build never depends on the RPC.
// Cache-Control carries the 10-minute TTL.
export const dynamic = 'force-dynamic';
const CACHE = { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600' };

export async function GET() {
  try {
    const snapshot = await buildIndex(serverClient(), FACTORIES, { claims: TAPEBOOK.claims, tapebook: TAPEBOOK.circuits });
    return Response.json({ ok: true, ...snapshot }, { headers: CACHE });
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
