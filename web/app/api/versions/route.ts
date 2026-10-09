// Version watcher: TapeOut logic in force, sealed flag, fees, Tapebook's conformance check and
// the upgrade / seal / fee-change history from the chain's event logs. Rebuilt at most every 10 minutes.
import { serverClient } from '@/lib/chain';
import { FACTORIES } from '@/lib/config';
import { readVersions } from '@/lib/versions';

export const revalidate = 600;
export const maxDuration = 60;
// Prerendered and revalidated as a whole; the RPC requests inside opt out of Next's fetch cache
// (lib/chain.ts), which force-static allows without turning the route dynamic.
export const dynamic = 'force-static';

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
  return Response.json({ builtAt: new Date().toISOString(), factories });
}
