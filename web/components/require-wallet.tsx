'use client';

// Every app page sits behind a connected wallet on the right network; only the landing page is public.
import type { ReactNode } from 'react';
import { useConnection } from 'wagmi';
import { CHAIN } from '@/lib/config';
import { useMounted } from '@/lib/hooks';
import { Card, Loading } from './common';
import { WriteGate } from './wallet';

export function RequireWallet({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const { isConnected, chainId, status } = useConnection();
  if (!mounted || status === 'reconnecting' || status === 'connecting') return <Loading what="Checking your wallet" />;
  if (isConnected && chainId === CHAIN.id) return <>{children}</>;
  return (
    <div className="flex justify-center py-16">
      <Card className="flex w-full max-w-[var(--max-width-form)] flex-col items-start gap-4">
        <span className="eyebrow">Wallet required</span>
        <h1 className="font-serif text-[length:var(--text-3xl)] leading-[var(--leading-tight)] text-accent">Connect your wallet to open Tapebook.</h1>
        <p className="card-desc">OKX Wallet, MetaMask or any browser wallet, on {CHAIN.id === 196 ? 'X Layer' : CHAIN.name}.</p>
        <WriteGate>
          <span />
        </WriteGate>
      </Card>
    </div>
  );
}
