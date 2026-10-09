// Display helpers. Anything unreadable renders as "—"; nothing is ever estimated or invented.
import { formatEther, type Address } from 'viem';
import { CHAIN, EXPLORER } from './config';

export const DASH = '—';

export function shortAddr(a: string | null | undefined): string {
  if (!a) return DASH;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function okb(wei: bigint | string | null | undefined, digits = 4): string {
  if (wei === null || wei === undefined) return DASH;
  const v = Number(formatEther(BigInt(wei)));
  return `${v.toLocaleString('en-US', { maximumFractionDigits: digits })} ${CHAIN.nativeCurrency.symbol}`;
}

export function num(v: bigint | number | string | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  return BigInt(v).toLocaleString('en-US');
}

export function explorerAddress(a: Address | string): string | null {
  return EXPLORER ? `${EXPLORER}/address/${a}` : null;
}

export function explorerTx(h: string): string | null {
  return EXPLORER ? `${EXPLORER}/tx/${h}` : null;
}

export function explorerBlock(n: bigint | number | string): string | null {
  return EXPLORER ? `${EXPLORER}/block/${n}` : null;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function dateTime(unixSeconds: bigint | number | string | null | undefined): string {
  if (unixSeconds === null || unixSeconds === undefined) return DASH;
  return new Date(Number(unixSeconds) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
