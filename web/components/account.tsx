'use client';

// Everything that needs a wallet, in one place, shown only after the wallet connects.
import Link from 'next/link';
import { useConnection, useDisconnect } from 'wagmi';
import { tapebookClaimsAbi } from '@/lib/abi';
import { useIndex } from '@/lib/api';
import { circuitStatus, claimsFor } from '@/lib/claims';
import { CHAIN, TAPEBOOK } from '@/lib/config';
import { okb, shortAddr } from '@/lib/format';
import { useMounted } from '@/lib/hooks';
import { useClaims, useCredit } from '@/lib/reads';
import { ClaimCard } from './claim-card';
import { Card, Loading, PageTitle, RpcError, StatusBadge } from './common';
import { TxAction, WriteGate } from './wallet';

export function Account() {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useConnection();
  const { mutate: disconnect } = useDisconnect();

  if (!mounted) return <Loading what="Checking your wallet" />;
  if (!isConnected || !address || chainId !== CHAIN.id)
    return (
      <>
        <PageTitle eyebrow="Account" title="Connect your wallet." />
        <Card className="flex max-w-[var(--max-width-form)] flex-col gap-4">
          <p className="card-desc">Post claims, manage bonds, hunt and collect payouts.</p>
          <WriteGate>
            <span />
          </WriteGate>
        </Card>
      </>
    );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle eyebrow="Account" title={shortAddr(address)} />
        <button className="btn btn-ghost mb-8" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
      <AccountBody address={address} />
    </>
  );
}

function AccountBody({ address }: { address: `0x${string}` }) {
  const { data: index, isLoading, error } = useIndex();
  const claims = useClaims();
  const credit = useCredit(address);
  const snap = index?.ok ? index : null;
  const me = address.toLowerCase();

  const mine = snap
    ? snap.factories.flatMap((f) => f.processors.flatMap((p) => p.list.filter((c) => c.owner?.toLowerCase() === me && !c.miterOf).map((c) => ({ p, c }))))
    : [];
  const myClaims = claims.data?.list.filter((c) => c.claimant.toLowerCase() === me).reverse() ?? [];
  const huntable = claims.data?.list.filter((c) => c.status === 1 && c.claimant.toLowerCase() !== me) ?? [];

  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <span className="eyebrow-sm">To withdraw</span>
          <span className="display-figure">{credit.data === undefined ? '…' : okb(credit.data)}</span>
          {TAPEBOOK.claims && (credit.data ?? 0n) > 0n && (
            <TxAction req={{ address: TAPEBOOK.claims, abi: tapebookClaimsAbi, functionName: 'withdraw', label: 'withdraw()' }} button="Withdraw" onConfirmed={() => credit.refetch()} />
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <span className="eyebrow-sm">Your claims</span>
          <span className="display-figure">{claims.data ? myClaims.length : '…'}</span>
        </Card>
        <Card className="flex flex-col gap-3">
          <span className="eyebrow-sm">Open claims to hunt</span>
          <span className="display-figure">{claims.data ? huntable.length : '…'}</span>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-[length:var(--text-3xl)] text-accent">Your circuits</h2>
        {isLoading && <Loading />}
        {error && <RpcError error={error} />}
        {snap && mine.length === 0 && <p className="card-desc">This wallet owns no circuits in the Book snapshot (block {snap.block.number}).</p>}
        {mine.length > 0 && (
          <Card className="!p-0 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Circuit</th>
                  <th>Processor</th>
                  <th>Pins</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mine.map(({ p, c }) => {
                  const st = circuitStatus(claimsFor(snap, p.circuits, c.id));
                  return (
                    <tr key={`${p.circuits}:${c.id}`}>
                      <td>
                        <Link className="underline" href={`/c/${p.circuits}/${c.id}`}>
                          #{c.id}
                        </Link>
                      </td>
                      <td>{p.name ?? shortAddr(p.circuits)}</td>
                      <td className="mono">
                        {c.nIn} → {c.nOut}
                      </td>
                      <td>
                        <StatusBadge status={st.status} bond={st.claim?.bond} />
                      </td>
                      <td className="text-right">
                        {c.nState === 0 && st.status !== 'OPEN' && TAPEBOOK.claims && (
                          <Link className="btn btn-primary" href={`/claim?cpu=${p.circuits}&id=${c.id}`}>
                            Post a claim
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-[length:var(--text-3xl)] text-accent">Your claims</h2>
        {claims.isLoading && <Loading />}
        {claims.error && <RpcError error={claims.error} />}
        {claims.data && myClaims.length === 0 && <p className="card-desc">No claims posted from this wallet.</p>}
        {myClaims.map((c) => (
          <ClaimCard key={c.claimId} claim={c} currentImpl={claims.data?.currentImpl} showTarget />
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-[length:var(--text-3xl)] text-accent">Hunt</h2>
        {claims.data && huntable.length === 0 && <p className="card-desc">No open claims from other wallets.</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {huntable.map((c) => (
            <Card key={c.claimId} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="card-title">Claim {c.claimId}</span>
                <span className="text-[length:var(--text-xs)] text-fg-secondary">
                  {shortAddr(c.cpu)} #{c.id} vs spec #{c.specId} · bond {okb(c.bond)}
                </span>
              </div>
              <Link className="btn btn-primary" href={`/hunt/${c.claimId}`}>
                Hunt
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
