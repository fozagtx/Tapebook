// Server-side caches for the two expensive chain reads behind /api/index and /api/versions.
// instrumentation.ts warms both at boot; each route serves cache.get().
import { serverClient } from '@/lib/chain';
import { FACTORIES, TAPEBOOK } from '@/lib/config';
import { buildIndex } from '@/lib/indexer';
import { cached } from '@/lib/snapshot-cache';
import { readVersions } from '@/lib/versions';

// Stored on globalThis: instrumentation.ts and each route bundle get their own module
// instance, so module-level state would not be shared between register() and the handlers.
const g = globalThis as unknown as {
  __tapebookIndexCache?: ReturnType<typeof makeIndexCache>;
  __tapebookVersionsCache?: ReturnType<typeof makeVersionsCache>;
};

function makeIndexCache() {
  return cached('index', 600_000, () => buildIndex(serverClient(), FACTORIES, { claims: TAPEBOOK.claims, tapebook: TAPEBOOK.circuits }));
}

function makeVersionsCache() {
  return cached('versions', 600_000, async () => {
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
    return { builtAt: new Date().toISOString(), factories };
  });
}

export const indexCache = (g.__tapebookIndexCache ??= makeIndexCache());
export const versionsCache = (g.__tapebookVersionsCache ??= makeVersionsCache());
