// Runs once when the Next.js server starts: precompute the two chain snapshots so the first
// /api/index and /api/versions requests hit a warm in-process cache instead of the RPC.
export async function register() {
  console.log(`[instrumentation] register() NEXT_RUNTIME=${process.env.NEXT_RUNTIME}`);
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { indexCache, versionsCache } = await import('@/lib/api-cache');
    indexCache.warm();
    versionsCache.warm();
  }
}
