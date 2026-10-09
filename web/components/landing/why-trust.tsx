'use client';

import { primaryVersions, useVersions } from '@/lib/api';
import { DASH } from '@/lib/format';

export function WhyTrust() {
  const { data, isLoading } = useVersions();
  const v = primaryVersions(data);
  const sealed = isLoading ? 'reading…' : v?.isSealed === true ? 'sealed' : v?.isSealed === false ? 'not sealed' : DASH;
  const points = [
    {
      title: 'No off-chain checking',
      body: 'A counterexample counts only if TapeOut’s own eval of the miter returns 1 on chain. There is no simulator, oracle or judge.',
    },
    {
      title: 'The contract has no owner',
      body: 'TapebookClaims has no admin, takes no fee and cannot be upgraded. Bonds move only by challenge, reclaim after the lock, or withdraw.',
    },
    {
      title: 'TapeOut itself is upgradeable until sealed',
      body: `TapeOut’s factory owner can replace circuit logic for every processor until seal() is called. Right now the factory is ${sealed}. Every claim records the logic it was posted under, and a claimant may take the bond back early if that logic changes.`,
    },
  ];
  return (
    <section className="border-y border-line bg-bg-surface py-20">
      <div className="container">
        <span className="eyebrow">Why trust it</span>
        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
          {points.map((p) => (
            <div key={p.title}>
              <h3 className="card-title">{p.title}</h3>
              <p className="card-desc mt-2">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
