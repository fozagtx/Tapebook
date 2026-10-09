// viem clients. Reads need no wallet; browser reads go to the public RPCs, server reads may use XLAYER_RPC_URL.
import { createPublicClient, fallback, http, type PublicClient } from 'viem';
import { CHAIN, PUBLIC_RPC_URLS, serverRpcUrls } from './config';

function transport(urls: string[], noStore = false) {
  // Server side, JSON-RPC POSTs must never be served from Next's data cache: a cached
  // eth_blockNumber or eth_call would stamp the snapshot with stale chain state.
  const fetchOptions: RequestInit | undefined = noStore ? { cache: 'no-store' } : undefined;
  return fallback(urls.map((u) => http(u, { timeout: 30_000, retryCount: 1, fetchOptions })));
}

let browserClient: PublicClient | null = null;

/** Public client for client components (shared). */
export function publicClient(): PublicClient {
  if (!browserClient) browserClient = createPublicClient({ chain: CHAIN, transport: transport(PUBLIC_RPC_URLS) }) as PublicClient;
  return browserClient;
}

/** Fresh client for route handlers. */
export function serverClient(urls: string[] = serverRpcUrls()): PublicClient {
  return createPublicClient({ chain: CHAIN, transport: transport(urls, true) }) as PublicClient;
}
