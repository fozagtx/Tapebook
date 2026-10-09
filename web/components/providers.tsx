'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, type Types } from 'connectkit';
import { MotionConfig } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { createConfig, fallback, http, WagmiProvider } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { CHAIN, PUBLIC_RPC_URLS } from '@/lib/config';
import { useDarkTheme } from '@/lib/hooks';

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

/* ConnectKit quirk: when customTheme contains --ck-accent-color it emits ONLY the
   accent-derived vars and drops the rest, so the accent is expressed through the
   vars it would have derived. Values are literal: customTheme is emitted verbatim
   and cannot resolve var() refs to tokens (app/tokens.css). */
const ckTheme = (dark: boolean): Types.CustomTheme =>
  dark
    ? {
        '--ck-font-family': '"Inter", system-ui, sans-serif',
        '--ck-focus-color': '#b2ffff',
        '--ck-secondary-button-background': '#b2ffff',
        '--ck-secondary-button-hover-background': '#b2ffff',
        '--ck-secondary-button-color': '#062020',
        '--ck-button-primary-color': '#062020',
        '--ck-body-background': '#0f3a3a',
        '--ck-body-color': '#e6fbfb',
        '--ck-body-color-muted': '#5f8f8c',
        '--ck-border-radius': '8px',
        '--ck-primary-button-background': '#b2ffff',
        '--ck-primary-button-color': '#062020',
        '--ck-overlay-background': 'rgba(0, 0, 0, 0.5)',
      }
    : {
        '--ck-font-family': '"Inter", system-ui, sans-serif',
        '--ck-focus-color': '#005f5f',
        '--ck-secondary-button-background': '#005f5f',
        '--ck-secondary-button-hover-background': '#005f5f',
        '--ck-secondary-button-color': '#fff',
        '--ck-button-primary-color': '#fff',
        '--ck-body-background': '#bfdbd6',
        '--ck-body-color': '#0b2626',
        '--ck-body-color-muted': '#557d7a',
        '--ck-border-radius': '8px',
        '--ck-primary-button-background': '#007a7a',
        '--ck-primary-button-color': '#fff',
        '--ck-overlay-background': 'rgba(11, 38, 38, 0.35)',
      };

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const dark = useDarkTheme();
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          mode={dark ? 'dark' : 'light'}
          customTheme={ckTheme(dark)}
          options={{ initialChainId: CHAIN.id, enforceSupportedChains: false }}
        >
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
