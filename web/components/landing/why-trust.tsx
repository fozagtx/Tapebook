'use client';

import { Cpu, ShieldOff, TriangleAlert } from 'lucide-react';
import { primaryVersions, useVersions } from '@/lib/api';
import { DASH } from '@/lib/format';

export function WhyTrust() {
  const { data, isLoading } = useVersions();
  const v = primaryVersions(data);
  const sealed = isLoading ? '…' : v?.isSealed === true ? 'sealed' : v?.isSealed === false ? 'not sealed' : DASH;
  const points = [
    { icon: Cpu, title: 'No off-chain checking', body: 'TapeOut’s own on-chain eval decides.' },
    { icon: ShieldOff, title: 'No owner', body: 'No admin, no fee, no upgrades.' },
    { icon: TriangleAlert, title: 'TapeOut is upgradeable until sealed', body: `Right now: ${sealed}.` },
  ];
  return (
    <section className="border-y border-line bg-bg-surface py-16">
      <div className="container">
        <span className="eyebrow">Why trust it</span>
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {points.map((p) => (
            <div key={p.title} className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-olive-bg text-moss">
                <p.icon size={18} />
              </span>
              <div>
                <h3 className="card-title">{p.title}</h3>
                <p className="card-desc mt-1">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
