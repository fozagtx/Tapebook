'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { parseEventLogs, type Hex } from 'viem';
import { useConnection } from 'wagmi';
import { countBurn, decode } from '../../core/netlist';
import { circuitsAbi, tapebookClaimsAbi, transistorsAbi } from '@/lib/abi';
import { useIndex } from '@/lib/api';
import { publicClient } from '@/lib/chain';
import { TAPEBOOK } from '@/lib/config';
import { okb } from '@/lib/format';
import { findCircuitByNetlist } from '@/lib/find';
import { specLabel } from '@/lib/labels';
import { Addr, Card, Loading, PageTitle, RpcError } from './common';
import { Stepper } from './stepper';
import { TxAction } from './wallet';

function Library() {
  const { data, isLoading, error } = useIndex();
  const snap = data?.ok ? data : null;
  if (isLoading) return <Loading what="Reading specs" />;
  if (error) return <RpcError error={error} />;
  if (data && !data.ok) return <RpcError error={data.error} />;
  const specs = snap?.claims?.specs ?? [];
  const tbList = snap?.factories.flatMap((f) => f.processors).find((p) => p.circuits.toLowerCase() === snap?.claims?.tapebook?.toLowerCase())?.list ?? [];
  if (!snap?.claims) return <p className="card-desc">No TapebookClaims contract is configured.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {specs.length === 0 && <p className="card-desc">No specs registered yet.</p>}
      {[...specs]
        .sort((a, b) => Number(b.seed) - Number(a.seed) || Number(a.specId) - Number(b.specId))
        .map((s) => {
          const c = tbList.find((x) => x.id === s.specId);
          const used = snap.claims!.list.filter((x) => x.specId === s.specId);
          return (
            <Card key={s.specId} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="card-title">{s.name || `Spec #${s.specId}`}</span>
                <span className={`tag ${s.seed ? 'tag-format' : 'tag-both'}`}>{specLabel(s)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-xs)] text-fg-secondary">
                <Link className="underline" href={`/c/${snap.claims!.tapebook}/${s.specId}`}>
                  circuit #{s.specId}
                </Link>
                <span>{c ? `${c.nIn} in → ${c.nOut} out · ${c.gateCount} gates` : '—'}</span>
                <span>
                  owner <Addr a={s.owner} />
                </span>
                {s.uri && (
                  <a className="underline" href={s.uri} target="_blank" rel="noreferrer">
                    source
                  </a>
                )}
              </div>
              <span className="text-[length:var(--text-xs)] text-fg-muted">
                {used.length} claim{used.length === 1 ? '' : 's'} ({used.filter((x) => x.status === 1).length} open, {used.filter((x) => x.status === 2).length} broken)
              </span>
            </Card>
          );
        })}
    </div>
  );
}

function AddSpec() {
  const [nlText, setNlText] = useState('');
  const [nInText, setNInText] = useState('');
  const [nOutText, setNOutText] = useState('');
  const [name, setName] = useState('');
  const [uri, setUri] = useState('');
  const [taped, setTaped] = useState<bigint | null>(null);
  const { address } = useConnection();
  const { data: index } = useIndex();
  const snap = index?.ok ? index : null;

  const parsed = useMemo(() => {
    const nIn = Number(nInText);
    const nOut = Number(nOutText);
    if (!/^0x[0-9a-fA-F]+$/.test(nlText.trim()) || !Number.isInteger(nIn) || !Number.isInteger(nOut) || nOut < 1 || nIn < 0) return null;
    try {
      const nl = nlText.trim() as Hex;
      const els = decode(nl, nIn);
      return { nl, nIn, nOut, burn: countBurn(els) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [nlText, nInText, nOutText]);
  const ok = parsed && !('error' in parsed) ? parsed : null;

  const chain = useQuery({
    queryKey: ['add-spec', ok?.nl, address, taped?.toString()],
    enabled: !!ok && !!TAPEBOOK.circuits && !!TAPEBOOK.transistors && !!TAPEBOOK.claims,
    queryFn: async () => {
      const c = publicClient();
      const [mintPrice, protocolFee, tapeoutFee, balance] = await Promise.all([
        c.readContract({ address: TAPEBOOK.transistors!, abi: transistorsAbi, functionName: 'mintPrice' }),
        c.readContract({ address: TAPEBOOK.transistors!, abi: transistorsAbi, functionName: 'protocolFee' }),
        c.readContract({ address: TAPEBOOK.circuits!, abi: circuitsAbi, functionName: 'TAPEOUT_FEE' }),
        address ? c.readContract({ address: TAPEBOOK.transistors!, abi: transistorsAbi, functionName: 'balanceOf', args: [address, 0n] }) : Promise.resolve(0n),
      ]);
      const existing = taped ?? (address ? await findCircuitByNetlist(TAPEBOOK.circuits!, ok!.nl, snap, address) : null);
      const registered = existing !== null ? (await c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'specs', args: [existing] }))[0] : null;
      return { mintPrice, protocolFee, tapeoutFee, balance, existing, registered };
    },
  });

  if (!TAPEBOOK.claims || !TAPEBOOK.circuits || !TAPEBOOK.transistors) return null;
  const d = chain.data;
  const need = BigInt(ok?.burn.nand ?? 0);
  const missing = d ? (d.balance >= need ? 0n : need - d.balance) : need;
  return (
    <Card className="flex flex-col gap-4">
      <span className="card-title">Add a spec</span>
      <p className="card-desc">Paste a stateless netlist, tape it out on the Tapebook processor, then label it.</p>
      <textarea className="input mono h-28 !rounded-[var(--radius-md)] py-2" placeholder="0x00000002…" value={nlText} onChange={(e) => setNlText(e.target.value)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <input className="input" placeholder="input pins" value={nInText} onChange={(e) => setNInText(e.target.value)} inputMode="numeric" />
        <input className="input" placeholder="output pins" value={nOutText} onChange={(e) => setNOutText(e.target.value)} inputMode="numeric" />
        <input className="input" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="source URL" value={uri} onChange={(e) => setUri(e.target.value)} />
      </div>
      {parsed && 'error' in parsed && <p className="panel-danger text-[length:var(--text-sm)]">{parsed.error}</p>}
      {ok && ok.burn.latch > 0 && <p className="panel-danger text-[length:var(--text-sm)]">A spec must be stateless; this netlist has {ok.burn.latch} LATCH.</p>}
      {ok && ok.burn.latch === 0 && chain.isLoading && <Loading />}
      {ok && ok.burn.latch === 0 && d && (
        <Stepper
          steps={[
            {
              title: `Mint ${need} TBOOK NAND`,
              done: d.existing !== null || missing === 0n,
              action: (
                <TxAction
                  req={{ address: TAPEBOOK.transistors!, abi: transistorsAbi, functionName: 'mint', args: [0n, missing], value: d.mintPrice * missing + d.protocolFee, label: `mint(0, ${missing})` }}
                  button="Mint NAND"
                  onConfirmed={() => chain.refetch()}
                />
              ),
            },
            {
              title: 'Tape out the spec',
              done: d.existing !== null,
              detail:
                d.existing !== null
                  ? taped !== null
                    ? `Taped out as circuit #${d.existing}.`
                    : `You already own circuit #${d.existing} with this exact netlist; it is registered instead of taping out a copy.`
                  : `TapeOut fee ${okb(d.tapeoutFee, 6)}.`,
              action: (
                <TxAction
                  req={{ address: TAPEBOOK.circuits!, abi: circuitsAbi, functionName: 'tapeout', args: [ok.nl, ok.nIn, ok.nOut], value: d.tapeoutFee, label: `tapeout(netlist, ${ok.nIn}, ${ok.nOut})` }}
                  button="Tape out"
                  onConfirmed={(r) => {
                    const [ev] = parseEventLogs({ abi: circuitsAbi, logs: r.logs, eventName: 'TapedOut' });
                    if (ev) setTaped(ev.args.circuitId);
                  }}
                />
              ),
            },
            {
              title: 'Register the spec',
              done: !!d.registered && d.registered !== '0x0000000000000000000000000000000000000000',
              action: d.existing !== null && (
                <TxAction
                  req={{ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'registerSpec', args: [d.existing, name, uri], label: `registerSpec(${d.existing}, "${name}", "${uri}")` }}
                  button="Register"
                  disabled={!name}
                  onConfirmed={() => chain.refetch()}
                />
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

export function Specs() {
  return (
    <>
      <PageTitle eyebrow="Specs" title="What circuits are claimed to match." />
      <Library />
      <div className="mt-10">
        <AddSpec />
      </div>
    </>
  );
}
