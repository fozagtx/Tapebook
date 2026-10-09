// Version watcher: TapeOut logic in force, sealed flag, fees, Tapebook's conformance check and
// the upgrade / seal / fee-change history from the chain's event logs. Cached at the edge for 10 minutes.
import { serverClient } from '@/lib/chain';
import { FACTORIES } from '@/lib/config';
import { readVersions } from '@/lib/versions';

export const maxDuration = 60;
// Computed at request time, not at build: the log scan can exceed the 60 s static-generation
// limit on a slow RPC, which would fail the whole build. Cache-Control carries the 10-minute TTL.
export const dynamic = 'force-dynamic';

export async function GET() {
  const client = serverClient();
  const factories = await Promise.all(
    FACTORIES.map(async (f) => {
      try {
        return { ok: true as const, label: f.label, ...(await readVersions(client, f, { claims: f.claims })) };
      } catch (e) {
        return { ok: false as const, label: f.label, factory: f.address, error: (e as Error).message.split('\n')[0] };
      }
    }),
  );
  return Response.json(
    { builtAt: new Date().toISOString(), factories },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600' } },
  );
}
