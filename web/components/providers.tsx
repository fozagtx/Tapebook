'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { createConfig, fallback, http, WagmiProvider } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { CHAIN, PUBLIC_RPC_URLS } from '@/lib/config';

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [
    injected(), // OKX Wallet, MetaMask and other browser extensions
    ...(WC_PROJECT_ID
      ? [walletConnect({ projectId: WC_PROJECT_ID, showQrModal: true, metadata: { name: 'Tapebook', description: 'Bonded, breakable claims about TapeOut circuits', url: 'https://tapebook.vercel.app', icons: [] } })]
      : []),
  ],
  transports: { [CHAIN.id]: fallback(PUBLIC_RPC_URLS.map((u) => http(u))) },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
