// The Book snapshot: every processor and circuit on the configured TapeOut factories, plus
// Tapebook claims and specs, read at one block. Rebuilt at most every 10 minutes.
import { serverClient } from '@/lib/chain';
import { FACTORIES, TAPEBOOK } from '@/lib/config';
import { buildIndex } from '@/lib/indexer';

export const revalidate = 600;
export const maxDuration = 60;
// Prerendered and revalidated as a whole; the RPC requests inside opt out of Next's fetch cache
// (lib/chain.ts), which force-static allows without turning the route dynamic.
export const dynamic = 'force-static';

export async function GET() {
  try {
    const snapshot = await buildIndex(serverClient(), FACTORIES, { claims: TAPEBOOK.claims, tapebook: TAPEBOOK.circuits });
    return Response.json({ ok: true, ...snapshot });
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
