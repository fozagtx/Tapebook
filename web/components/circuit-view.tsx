'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { isAddress, keccak256, type Address } from 'viem';
import { useConnection } from 'wagmi';
import { countBurn, decode, refTargets } from '../../contracts/core/netlist';
import { useIndex } from '@/lib/api';
import { TAPEBOOK } from '@/lib/config';
import { DASH, dateTime, num } from '@/lib/format';
import { labelFor } from '@/lib/labels';
import { useCircuit, useClaims } from '@/lib/reads';
import { ClaimCard } from './claim-card';
import { Addr, Card, Field, Loading, PageTitle, RpcError } from './common';

export function CircuitView({ cpu: cpuParam, id: idParam }: { cpu: string; id: string }) {
  const cpu = isAddress(cpuParam, { strict: false }) ? (cpuParam as Address) : null;
  const id = /^\d+$/.test(idParam) ? BigInt(idParam) : null;
  const circuit = useCircuit(cpu, id);
  const claims = useClaims();
  const { data: index } = useIndex();
  const { address } = useConnection();
  const snap = index?.ok ? index : null;

  const decoded = useMemo(() => {
    const d = circuit.data;
    if (!d || d.kind !== 'ok' || !d.netlist || !d.info) return null;
    try {
      const els = decode(d.netlist, d.info.nIn);
      return { burn: countBurn(els), refs: refTargets(els), hash: keccak256(d.netlist), size: (d.netlist.length - 2) / 2 };
    } catch {
      return null;
    }
  }, [circuit.data]);

  if (!cpu) return <PageTitle eyebrow="Circuit" title="Not a processor">“{cpuParam}” is not an address.</PageTitle>;
  if (id === null) return <PageTitle eyebrow="Circuit" title="Id out of range">Circuit ids are positive integers.</PageTitle>;
  if (circuit.isLoading) return <Loading />;
  if (circuit.error) return <RpcError error={circuit.error} />;
  const d = circuit.data!;
  if (d.kind === 'not-a-processor')
    return (
      <PageTitle eyebrow="Circuit" title="Not a processor">
        <Addr a={cpu} full /> is not registered with any configured TapeOut factory (<span className="mono">isCPU</span> is false).
      </PageTitle>
    );
  if (d.kind === 'out-of-range')
    return (
      <PageTitle eyebrow="Circuit" title="Id out of range">
        This processor has circuits 1 to {d.nextId.toString()}; there is no circuit #{id.toString()}.
      </PageTitle>
    );

  const mine = claims.data?.list.filter((c) => c.cpu.toLowerCase() === cpu.toLowerCase() && c.id === id.toString()).reverse() ?? [];
  const label = snap ? labelFor(snap, cpu, { id: id.toString(), owner: d.owner, miterOf: snap.factories.flatMap((f) => f.processors).find((p) => p.circuits.toLowerCase() === cpu.toLowerCase())?.list.find((c) => c.id === id.toString())?.miterOf }) : null;
  const copies =
    snap && decoded
      ? snap.factories.flatMap((f) => f.processors.flatMap((p) => p.list.filter((c) => c.hash === decoded.hash && !(p.circuits.toLowerCase() === cpu.toLowerCase() && c.id === id.toString())).map((c) => ({ cpu: p.circuits, id: c.id }))))
      : [];
  const stateful = d.info ? d.info.nState > 0 : false;
  const owner = d.owner && address && d.owner.toLowerCase() === address.toLowerCase();

  return (
    <>
      <PageTitle eyebrow={`${d.name ?? DASH} (${d.symbol ?? DASH})`} title={`Circuit #${id.toString()}`}>
        <span className="flex flex-wrap items-center gap-2">
          on processor <Addr a={cpu} full />
          {label && <span className="tag tag-format">{label.text}</span>}
        </span>
      </PageTitle>

      <Card className="mb-8">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Field label="Owner">
            <Addr a={d.owner} />
          </Field>
          <Field label="Input pins">{d.info?.nIn ?? DASH}</Field>
          <Field label="Output pins">{d.info?.nOut ?? DASH}</Field>
          <Field label="State bits (LATCH, recursive)">{d.info?.nState ?? DASH}</Field>
          <Field label="Gates (recursive)">{d.info ? num(d.info.gateCount) : DASH}</Field>
          <Field label="Burned this layer">{decoded ? `${decoded.burn.nand} NAND · ${decoded.burn.latch} LATCH · ${decoded.burn.refs} REF` : DASH}</Field>
          <Field label="Netlist">{decoded ? `${decoded.size.toLocaleString('en-US')} bytes` : DASH}</Field>
          <Field label="Netlist hash">
            <span className="mono text-[length:var(--text-xs)]">{decoded ? `${decoded.hash.slice(0, 18)}…` : DASH}</span>
          </Field>
        </div>
        {decoded && decoded.refs.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 text-[length:var(--text-xs)]">
            <span className="eyebrow-sm">References</span>
            {decoded.refs.map((r) => (
              <Link key={`${r.cpu}:${r.circuitId}`} href={`/c/${r.cpu}/${r.circuitId}`} className="chip">
                {r.cpu.slice(0, 8)}… #{r.circuitId.toString()}
              </Link>
            ))}
          </div>
        )}
        {copies.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-[length:var(--text-xs)]">
            <span className="eyebrow-sm">Same netlist</span>
            {copies.slice(0, 12).map((c) => (
              <Link key={`${c.cpu}:${c.id}`} href={`/c/${c.cpu}/${c.id}`} className="chip">
                {c.cpu.slice(0, 8)}… #{c.id}
              </Link>
            ))}
            {copies.length > 12 && <span>+{copies.length - 12} more</span>}
          </div>
        )}
        <p className="mt-6 text-[length:var(--text-xs)] text-fg-muted">
          Read live from the chain{snap ? `; Book snapshot at block ${snap.block.number} (${dateTime(snap.block.timestamp)})` : ''}.
        </p>
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-[length:var(--text-3xl)] text-accent">Claims</h2>
          {stateful ? (
            <span className="badge badge-warning">Stateful circuits cannot be claimed</span>
          ) : (
            TAPEBOOK.claims && (
              <Link href={`/claim?cpu=${cpu}&id=${id.toString()}`} className="btn btn-ghost">
                {owner ? 'Post a claim on this circuit' : 'Post a claim (owner only)'}
              </Link>
            )
          )}
        </div>
        {!TAPEBOOK.claims && <p className="card-desc">No TapebookClaims contract is configured.</p>}
        {claims.isLoading && <Loading what="Reading claims" />}
        {claims.error && <RpcError error={claims.error} />}
        {claims.data && mine.length === 0 && (
          <Card>
            <span className="badge badge-unclaimed">UNCLAIMED</span>
            <p className="card-desc mt-2">The owner has posted no claim about this circuit.</p>
          </Card>
        )}
        {mine.map((c) => (
          <ClaimCard key={c.claimId} claim={c} currentImpl={claims.data?.currentImpl} target={d.info} targetNetlist={d.netlist} />
        ))}
      </section>
    </>
  );
}
