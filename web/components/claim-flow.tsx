'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { isAddress, parseEther, type Address } from 'viem';
import { useAccount } from 'wagmi';
import { buildMiter, miterNand } from '../../contracts/core/miter';
import { circuitsAbi, tapebookClaimsAbi, transistorsAbi } from '@/lib/abi';
import { useIndex } from '@/lib/api';
import { publicClient } from '@/lib/chain';
import { LIMITS, TAPEBOOK } from '@/lib/config';
import { okb } from '@/lib/format';
import { findCircuitByNetlist } from '@/lib/find';
import { specLabel } from '@/lib/labels';
import { useCircuit } from '@/lib/reads';
import { Addr, Card, Field, Loading, PageTitle, RpcError } from './common';
import { Stepper } from './stepper';
import { TxAction } from './wallet';

export function ClaimFlow() {
  const params = useSearchParams();
  const [cpuText, setCpuText] = useState(params.get('cpu') ?? '');
  const [idText, setIdText] = useState(params.get('id') ?? '');
  const [specText, setSpecText] = useState(params.get('spec') ?? '');
  const [bondText, setBondText] = useState('0');
  const [lockDays, setLockDays] = useState('7');
  const { address } = useAccount();
  const { data: index } = useIndex();
  const snap = index?.ok ? index : null;

  const cpu = isAddress(cpuText.trim(), { strict: false }) ? (cpuText.trim() as Address) : null;
  const id = /^\d+$/.test(idText.trim()) ? BigInt(idText.trim()) : null;
  const specId = /^\d+$/.test(specText.trim()) ? BigInt(specText.trim()) : null;
  let bond: bigint | null = null;
  try {
    bond = parseEther(bondText || '0');
  } catch {
    bond = null;
  }
  const lockSeconds = BigInt(Math.max(0, Math.floor(Number(lockDays || '0') * 86_400)));
  const target = useCircuit(cpu, id);
  const tb = TAPEBOOK.circuits;

  const chain = useQuery({
    queryKey: ['claim-flow', cpu, id?.toString(), specId?.toString(), address, target.data?.kind],
    enabled: !!tb && !!TAPEBOOK.transistors && !!TAPEBOOK.claims && !!cpu && id !== null && specId !== null && target.data?.kind === 'ok',
    queryFn: async () => {
      const c = publicClient();
      const t = target.data as Extract<typeof target.data, { kind: 'ok' }>;
      const specInfo = await c.readContract({ address: tb!, abi: circuitsAbi, functionName: 'circuitInfo', args: [specId!] }).catch(() => null);
      const [mintPrice, protocolFee, tapeoutFee, balance, openId] = await Promise.all([
        c.readContract({ address: TAPEBOOK.transistors!, abi: transistorsAbi, functionName: 'mintPrice' }),
        c.readContract({ address: TAPEBOOK.transistors!, abi: transistorsAbi, functionName: 'protocolFee' }),
        c.readContract({ address: tb!, abi: circuitsAbi, functionName: 'TAPEOUT_FEE' }),
        address ? c.readContract({ address: TAPEBOOK.transistors!, abi: transistorsAbi, functionName: 'balanceOf', args: [address, 0n] }) : Promise.resolve(0n),
        c
          .readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'claimKey', args: [cpu!, id!, specId!] })
          .then((k) => c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'openClaimOf', args: [k] })),
      ]);
      const spec = await c.readContract({ address: TAPEBOOK.claims!, abi: tapebookClaimsAbi, functionName: 'specs', args: [specId!] });
      let miter: ReturnType<typeof buildMiter> | null = null;
      let miterId: bigint | null = null;
      const shapeOk = !!(t.info && specInfo && t.info.nIn === specInfo[0] && t.info.nOut === specInfo[1] && t.info.nIn <= 255 && t.info.nOut <= 255);
      if (shapeOk) {
        miter = buildMiter({ tapebook: tb!, cpu: cpu!, id: id!, specId: specId!, nIn: t.info!.nIn, nOut: t.info!.nOut });
        miterId = await findCircuitByNetlist(tb!, miter.netlist, snap);
      }
      return { specInfo, mintPrice, protocolFee, tapeoutFee, balance, openId, spec, miter, miterId, shapeOk };
    },
  });

  const specs = snap?.claims?.specs ?? [];
  const tbList = snap?.factories.flatMap((f) => f.processors).find((p) => p.circuits.toLowerCase() === tb?.toLowerCase())?.list ?? [];
  const t = target.data?.kind === 'ok' ? target.data : null;
  const matching = specs.filter((s) => {
    const c = tbList.find((x) => x.id === s.specId);
    return !t?.info || (c && c.nIn === t.info.nIn && c.nOut === t.info.nOut);
  });

  const problems: string[] = [];
  const isOwner = !!(t?.owner && address && t.owner.toLowerCase() === address.toLowerCase());
  if (t?.info && t.info.nState > 0) problems.push('Stateful circuits cannot be claimed.');
  const d = chain.data;
  if (d && !d.specInfo) problems.push(`Spec #${specId} does not exist on the Tapebook processor.`);
  if (d?.specInfo && d.specInfo[2] !== 0) problems.push('The spec is stateful.');
  if (d && d.specInfo && !d.shapeOk) problems.push('Target and spec must have the same input and output pin counts (at most 255 each).');
  const gates = t?.info && d?.specInfo ? t.info.gateCount + d.specInfo[3] + miterNand(t.info.nOut) : null;
  if (gates !== null && gates > LIMITS.maxGates) problems.push(`The miter would have ${gates} gates in total; the limit is ${LIMITS.maxGates}.`);
  if (bond === null) problems.push('The bond is not a number.');
  else if (bond > LIMITS.maxBond) problems.push('Bonds are capped at 1 OKB.');
  else if (bond > 0n && lockSeconds < LIMITS.minLockSeconds) problems.push('A bonded claim must lock its bond for at least one day.');

  const need = t?.info ? BigInt(miterNand(t.info.nOut)) : 0n;
  const missing = d ? (d.balance >= need ? 0n : need - d.balance) : need;
  const refetch = () => chain.refetch();

  return (
    <>
      <PageTitle eyebrow="Post a claim" title="Stake on your circuit." />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="eyebrow-sm">Target processor (Circuits address)</span>
            <input className="input mono" value={cpuText} onChange={(e) => setCpuText(e.target.value)} placeholder="0x…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow-sm">Target circuit id</span>
            <input className="input" value={idText} onChange={(e) => setIdText(e.target.value)} placeholder="1" inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow-sm">Spec (circuit id on the Tapebook processor)</span>
            <select className="input" value={specText} onChange={(e) => setSpecText(e.target.value)}>
              <option value="">Choose a spec…</option>
              {matching.map((s) => (
                <option key={s.specId} value={s.specId}>
                  #{s.specId} {s.name} ({specLabel(s)})
                </option>
              ))}
              {specText && !matching.some((s) => s.specId === specText) && <option value={specText}>#{specText} (entered)</option>}
            </select>
            <input className="input" value={specText} onChange={(e) => setSpecText(e.target.value)} placeholder="or type a spec id" inputMode="numeric" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="eyebrow-sm">Bond (OKB, at most 1)</span>
              <input className="input" value={bondText} onChange={(e) => setBondText(e.target.value)} inputMode="decimal" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow-sm">Lock (days, at least 1 if bonded)</span>
              <input className="input" value={lockDays} onChange={(e) => setLockDays(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </div>
      </Card>

      {!TAPEBOOK.claims || !tb || !TAPEBOOK.transistors ? (
        <p className="panel-warning">Tapebook is not configured (NEXT_PUBLIC_CLAIMS_ADDRESS, NEXT_PUBLIC_TAPEBOOK_CIRCUITS, NEXT_PUBLIC_TAPEBOOK_TRANSISTORS).</p>
      ) : !cpu || id === null ? (
        <p className="card-desc">Enter a target processor and circuit id. Circuit pages link here with both filled in.</p>
      ) : target.isLoading ? (
        <Loading />
      ) : target.error ? (
        <RpcError error={target.error} />
      ) : target.data?.kind === 'not-a-processor' ? (
        <p className="panel-danger">That address is not a TapeOut processor.</p>
      ) : target.data?.kind === 'out-of-range' ? (
        <p className="panel-danger">Id out of range: the processor has circuits 1 to {target.data.nextId.toString()}.</p>
      ) : t ? (
        <>
          <Card className="mb-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Target">
                <Link className="underline" href={`/c/${cpu}/${id}`}>
                  {t.name ?? '—'} #{id.toString()}
                </Link>
              </Field>
              <Field label="Owner">
                <Addr a={t.owner} />
              </Field>
              <Field label="Shape">{t.info ? `${t.info.nIn} in → ${t.info.nOut} out, ${t.info.gateCount} gates` : '—'}</Field>
              <Field label="Miter cost">{t.info ? `${miterNand(t.info.nOut)} NAND, ${gates ?? '—'} gates in total` : '—'}</Field>
            </div>
            {!isOwner && (
              <p className="panel-warning mt-4 text-[length:var(--text-sm)]">
                Only the owner can post a claim. This circuit is owned by <Addr a={t.owner} full />
                {address ? '; you are connected as a different address.' : '.'}
              </p>
            )}
          </Card>
          {specId === null ? (
            <p className="card-desc">Choose a spec.</p>
          ) : chain.isLoading ? (
            <Loading />
          ) : chain.error ? (
            <RpcError error={chain.error} />
          ) : d ? (
            <>
              {problems.length > 0 && (
                <ul className="panel-danger mb-6 list-disc pl-8 text-[length:var(--text-sm)]">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {d.openId > 0n ? (
                <div className="panel-success text-[length:var(--text-sm)]">
                  Claim {d.openId.toString()} is open on this circuit and spec.{' '}
                  <Link className="underline" href={`/c/${cpu}/${id}`}>
                    View it
                  </Link>
                </div>
              ) : (
                <Stepper
                  steps={[
                    {
                      title: `Mint ${need.toString()} TBOOK NAND`,
                      done: d.miterId !== null || missing === 0n,
                      detail: d.miterId !== null ? 'The miter already exists.' : `You hold ${d.balance.toString()} NAND; the miter burns ${need.toString()}.`,
                      action: (
                        <TxAction
                          req={{
                            address: TAPEBOOK.transistors!,
                            abi: transistorsAbi,
                            functionName: 'mint',
                            args: [0n, missing],
                            value: d.mintPrice * missing + d.protocolFee,
                            label: `mint(0, ${missing}) = ${missing} × ${okb(d.mintPrice, 6)} + protocol fee ${okb(d.protocolFee, 6)}`,
                          }}
                          button="Mint NAND"
                          disabled={problems.length > 0 || !isOwner}
                          onConfirmed={refetch}
                        />
                      ),
                    },
                    {
                      title: 'Tape out the miter',
                      done: d.miterId !== null,
                      detail: d.miterId !== null ? <>Miter circuit #{d.miterId.toString()}.</> : `Netlist of ${(d.miter!.netlist.length - 2) / 2} bytes; TapeOut fee ${okb(d.tapeoutFee, 6)}.`,
                      action: d.miter && (
                        <TxAction
                          req={{ address: tb, abi: circuitsAbi, functionName: 'tapeout', args: [d.miter.netlist, d.miter.nIn, 1], value: d.tapeoutFee, label: `tapeout(miter, ${d.miter.nIn}, 1)` }}
                          button="Tape out miter"
                          disabled={problems.length > 0 || !isOwner}
                          onConfirmed={refetch}
                        />
                      ),
                    },
                    {
                      title: 'Post the claim',
                      done: false,
                      detail: (
                        <>
                          Spec #{specId.toString()} {d.spec[1] ? `“${d.spec[1]}”` : '(unregistered)'} · bond {okb(bond ?? 0n)} · lock {lockDays || 0} days
                        </>
                      ),
                      action: d.miterId !== null && (
                        <TxAction
                          req={{
                            address: TAPEBOOK.claims!,
                            abi: tapebookClaimsAbi,
                            functionName: 'post',
                            args: [cpu, id, specId, d.miterId, lockSeconds],
                            value: bond ?? 0n,
                            label: `post(${cpu.slice(0, 8)}…, ${id}, ${specId}, ${d.miterId}, ${lockSeconds})`,
                          }}
                          button="Post claim"
                          disabled={problems.length > 0 || !isOwner}
                          onConfirmed={refetch}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
