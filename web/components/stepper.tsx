import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface Step {
  title: string;
  done: boolean;
  detail?: ReactNode;
  /** Rendered when this is the current step. */
  action?: ReactNode;
}

/** A multi-step flow whose state is re-derived from the chain, so it resumes after a reload. */
export function Stepper({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const state = s.done ? 'done' : i === current ? 'current' : 'pending';
        return (
          <li key={s.title} className={`card flex gap-4 ${state === 'pending' ? 'opacity-60' : ''}`}>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[length:var(--text-xs)] ${
                state === 'done' ? 'border-success-border bg-success-bg text-success' : state === 'current' ? 'border-moss bg-moss text-[var(--btn-primary-text)]' : 'border-line text-fg-muted'
              }`}
            >
              {state === 'done' ? <Check size={14} /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="card-title">{s.title}</span>
              {s.detail && <div className="card-desc">{s.detail}</div>}
              {state === 'current' && s.action}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
