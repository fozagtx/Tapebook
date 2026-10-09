'use client';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** False during SSR and hydration, true afterwards (wallet state only exists in the browser). */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

let nowCache = Math.floor(Date.now() / 1000);
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;
function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  if (!nowTimer)
    nowTimer = setInterval(() => {
      nowCache = Math.floor(Date.now() / 1000);
      nowListeners.forEach((l) => l());
    }, 15_000);
  return () => {
    nowListeners.delete(cb);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

/** Current unix time in seconds, refreshed every 15 s. */
export function useNow(): number {
  return useSyncExternalStore(subscribeNow, () => nowCache, () => 0);
}

/** A CSS custom property of <html>, resolved (canvas cannot read var()). */
export function useCssVar(name: string): string | undefined {
  return useSyncExternalStore(
    noop,
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined,
    () => undefined,
  );
}

function subscribeTheme(cb: () => void) {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => o.disconnect();
}

export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === 'dark', () => false);
}
