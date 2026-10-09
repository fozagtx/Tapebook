'use client';

// Wallet connection and transactions (PRD section 12a). Reading needs no wallet; the app never
// asks to connect until the user starts a write action, never holds keys and never signs for anyone.
import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConnectKitButton, useModal } from 'connectkit';
import { useRouter } from 'next/navigation';
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import type { Abi, Address, Hex, TransactionReceipt } from 'viem';
import { CHAIN, EXPLORER, PUBLIC_RPC_URLS } from '@/lib/config';
import { reason } from '@/lib/errors';
import { okb, shortAddr } from '@/lib/format';
import { useMounted } from '@/lib/hooks';
import { Addr, CopyButton, TxLink } from './common';

export function ConnectButton({ compact }: { compact?: boolean }) {
  const { address, isConnected } = useAccount();
  const mounted = useMounted();

  if (!mounted) return <button className="btn btn-ghost" disabled>{compact ? <Wallet size={14} /> : 'Connect wallet'}</button>;
  if (isConnected && address)
    return (
      <Link className="btn btn-ghost mono" href="/account" title={address}>
        {shortAddr(address)}
      </Link>
    );
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnecting }) => (
        <button className="btn btn-ghost inline-flex items-center gap-1" onClick={show} disabled={isConnecting}>
          <Wallet size={14} />
          {!compact && (isConnecting ? 'Connecting…' : 'Connect wallet')}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}

/** "Open the Book" CTAs: connect first if needed, then go to /book. */
export function useOpenBook() {
  const { isConnected } = useAccount();
  const { open, setOpen } = useModal();
  const router = useRouter();
  const mounted = useMounted();
  const [pending, setPending] = useState(false);
  const prevOpen = useRef(open);
  useEffect(() => {
    if (pending && isConnected) {
      setPending(false);
      router.push('/book');
    }
  }, [pending, isConnected, router]);
  // Modal dismissed without connecting: clear the pending navigation.
  useEffect(() => {
    const wasOpen = prevOpen.current;
    prevOpen.current = open;
    if (wasOpen && !open && !isConnected) setPending(false);
  }, [open, isConnected]);
  const connected = mounted && isConnected;
  return {
    label: connected ? 'Open the Book' : 'Connect wallet',
    onClick: () => {
      if (connected) router.push('/book');
      else {
        setPending(true);
        setOpen(true);
      }
    },
  };
}

/** Network details for adding the chain by hand when the wallet does not know it. */
export function NetworkDetails() {
  const details = [
    `Network name: ${CHAIN.name}`,
    `Chain ID: ${CHAIN.id}`,
    `RPC URL: ${PUBLIC_RPC_URLS[0]}`,
    `Currency symbol: ${CHAIN.nativeCurrency.symbol}`,
    ...(EXPLORER ? [`Block explorer: ${EXPLORER}`] : []),
  ].join('\n');
  return (
    <div className="panel-warning flex flex-col gap-2 text-[length:var(--text-sm)]">
      <p>Your wallet does not know this network. Add it manually with these details:</p>
      <pre className="mono whitespace-pre-wrap">{details}</pre>
      <div>
        <CopyButton text={details} label="Copy network details" />
      </div>
    </div>
  );
}

/**
 * Wraps write actions: asks to connect, then to switch to X Layer, before rendering `children`.
 * Write buttons therefore read "Connect wallet" or "Switch to X Layer" until the wallet is ready.
 */
export function WriteGate({ children }: { children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();
  const mounted = useMounted();
  if (!mounted) return null;
  if (!isConnected) return <ConnectButton />;
  if (chainId !== CHAIN.id) {
    const unknown = error && /4902|unrecognized|not been added|unknown chain/i.test(`${(error as { code?: number }).code ?? ''} ${error.message}`);
    return (
      <div className="flex flex-col gap-3">
        <button className="btn btn-primary" onClick={() => switchChain({ chainId: CHAIN.id })} disabled={isPending}>
          {isPending ? 'Switching…' : `Switch to ${CHAIN.id === 196 ? 'X Layer' : CHAIN.name}`}
        </button>
        {unknown ? <NetworkDetails /> : error ? <p className="text-[length:var(--text-xs)] text-danger">{reason(error)}</p> : null}
      </div>
    );
  }
  return <>{children}</>;
}

export interface TxRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  /** Human description of the call for the preview, e.g. "mint(0, 60)". */
  label: string;
}

type Sent = { kind: 'idle' } | { kind: 'signing' } | { kind: 'sent'; hash: Hex } | { kind: 'rejected'; error: string };

export type TxState =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'pending'; hash: Hex }
  | { kind: 'confirmed'; hash: Hex; receipt: TransactionReceipt }
  | { kind: 'failed'; error: string; hash?: Hex };

/** One transaction with its four visible states: awaiting signature, pending, confirmed, failed. */
export function useTx(onConfirmed?: (receipt: TransactionReceipt) => void) {
  const { writeContractAsync } = useWriteContract();
  const [sent, setSent] = useState<Sent>({ kind: 'idle' });
  const hash = sent.kind === 'sent' ? sent.hash : undefined;
  const wait = useWaitForTransactionReceipt({ hash, chainId: CHAIN.id });

  let state: TxState;
  if (sent.kind === 'sent') {
    if (wait.data) state = wait.data.status === 'success' ? { kind: 'confirmed', hash: sent.hash, receipt: wait.data } : { kind: 'failed', hash: sent.hash, error: 'Reverted on chain.' };
    else if (wait.error) state = { kind: 'failed', hash: sent.hash, error: reason(wait.error) };
    else state = { kind: 'pending', hash: sent.hash };
  } else if (sent.kind === 'rejected') state = { kind: 'failed', error: sent.error };
  else state = sent;

  // Tell the caller once per confirmed transaction (it re-reads chain state).
  const notified = useRef<Hex | null>(null);
  const cb = useRef(onConfirmed);
  useEffect(() => {
    cb.current = onConfirmed;
  });
  useEffect(() => {
    if (state.kind === 'confirmed' && notified.current !== state.hash) {
      notified.current = state.hash;
      cb.current?.(state.receipt);
    }
  });

  async function send(req: TxRequest) {
    setSent({ kind: 'signing' });
    try {
      const h = await writeContractAsync({
        address: req.address,
        abi: req.abi,
        functionName: req.functionName,
        args: req.args,
        value: req.value,
        chainId: CHAIN.id,
      } as never);
      setSent({ kind: 'sent', hash: h });
    } catch (e) {
      setSent({ kind: 'rejected', error: reason(e) });
    }
  }

  return { state, send, reset: () => setSent({ kind: 'idle' }) };
}

/** What will be sent, shown before the wallet prompt. */
export function TxPreview({ req }: { req: TxRequest | null }) {
  if (!req) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[length:var(--text-xs)] text-fg-secondary">
      <dt>Function</dt>
      <dd className="mono">{req.label}</dd>
      <dt>Value</dt>
      <dd className="mono">{okb(req.value ?? 0n, 6)}</dd>
      <dt>Contract</dt>
      <dd>
        <Addr a={req.address} full />
      </dd>
    </dl>
  );
}

export function TxStatus({ state }: { state: TxState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'signing') return <p className="text-[length:var(--text-xs)] text-fg-secondary">Awaiting signature in your wallet…</p>;
  if (state.kind === 'pending')
    return (
      <p className="text-[length:var(--text-xs)] text-fg-secondary">
        Pending: <TxLink hash={state.hash} />
      </p>
    );
  if (state.kind === 'confirmed')
    return (
      <p className="text-[length:var(--text-xs)] text-success">
        Confirmed in block {state.receipt.blockNumber.toString()}: <TxLink hash={state.hash} />
      </p>
    );
  return (
    <p className="text-[length:var(--text-xs)] text-danger">
      Failed: {state.error} {state.hash && <TxLink hash={state.hash} />}
    </p>
  );
}

/** A preview, a send button and the status line for one transaction. */
export function TxAction({
  req,
  button,
  disabled,
  onConfirmed,
}: {
  req: TxRequest | null;
  button: string;
  disabled?: boolean;
  onConfirmed?: (r: TransactionReceipt) => void;
}) {
  const { state, send } = useTx(onConfirmed);
  const busy = state.kind === 'signing' || state.kind === 'pending';
  return (
    <div className="flex flex-col gap-3">
      <TxPreview req={req} />
      <WriteGate>
        <div>
          <button className="btn btn-primary" disabled={!req || disabled || busy} onClick={() => req && send(req)}>
            {busy ? 'Working…' : button}
          </button>
        </div>
      </WriteGate>
      <TxStatus state={state} />
    </div>
  );
}
