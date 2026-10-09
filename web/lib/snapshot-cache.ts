/** In-process cache for expensive chain reads: first call computes, later calls return the
 *  last value instantly and refresh in the background once it is older than ttlMs. */
export function cached<T>(name: string, ttlMs: number, compute: () => Promise<T>) {
  let value: { at: number; data: T } | null = null;
  let inflight: Promise<T> | null = null;
  const refresh = () => {
    if (!inflight)
      inflight = compute()
        .then((data) => {
          value = { at: Date.now(), data };
          return data;
        })
        .finally(() => {
          inflight = null;
        });
    return inflight;
  };
  return {
    async get(): Promise<T> {
      if (!value) return refresh();
      if (Date.now() - value.at > ttlMs) void refresh().catch((e) => console.error(`[${name}] refresh failed`, e));
      return value.data;
    },
    warm: () => void refresh().catch((e) => console.error(`[${name}] warm failed`, e)),
    age: () => (value ? Date.now() - value.at : null),
  };
}
