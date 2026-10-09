'use client';

// "What Tapebook does", animated: stake → hunt → break → get paid, on Tapebook's reference pair
// (Target B claimed against ADD8C). Inputs and outputs come from core/demo.ts, which the contract
// tests check against TapeOut's own eval.
import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion } from 'framer-motion';
import { Coins, Lock, Search, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEMO_HIT, DEMO_MISSES, type DemoVector } from '../../../contracts/core/demo';
import { cn } from '@/lib/utils';
import { EASE } from './motion';

const STEPS: { icon: LucideIcon; title: string; line: string; ms: number }[] = [
  { icon: Lock, title: 'Stake', line: 'The owner bonds OKB: “Target B behaves like ADD8C.”', ms: 2600 },
  { icon: Search, title: 'Hunt', line: 'Anyone tries inputs. TapeOut evaluates both circuits.', ms: 3600 },
  { icon: Zap, title: 'Break', line: '127 + 1: Target B says 384, ADD8C says 128.', ms: 3000 },
  { icon: Coins, title: 'Get paid', line: 'The claim is BROKEN. The bond goes to the hunter.', ms: 2800 },
];

const bits = (n: number, w: number) => Array.from({ length: w }, (_, i) => (n >> (w - 1 - i)) & 1);

function BitRow({ value, width, diff, dim }: { value: number; width: number; diff?: number; dim?: boolean }) {
  const b = bits(value, width);
  const d = diff === undefined ? null : bits(diff, width);
  return (
    <span className={cn('flex gap-[3px] transition-opacity', dim && 'opacity-40')}>
      {b.map((v, i) => (
        <motion.span
          key={i}
          animate={{ scale: d && d[i] !== v ? [1, 1.25, 1] : 1 }}
          transition={{ duration: 0.4 }}
          className={cn(
            'h-4 w-4 rounded-[3px] border-2 sm:h-5 sm:w-5',
            v ? 'border-accent-dark bg-moss-light' : 'border-line bg-bg-surface',
            d && d[i] !== v && '!border-danger ring-2 ring-danger',
          )}
        />
      ))}
    </span>
  );
}

function Coin() {
  return (
    <motion.span
      layoutId="demo-bond"
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-accent-dark bg-olive-light text-accent-dark shadow-sm"
      aria-label="bond"
    >
      <Coins size={16} />
    </motion.span>
  );
}

function Wallet({ label, children, active }: { label: string; children?: React.ReactNode; active?: boolean }) {
  return (
    <div className={cn('flex min-w-[120px] flex-col items-center gap-2 rounded-[var(--radius-md)] border-2 border-line bg-bg-base p-3 transition-shadow', active && 'shadow-md')}>
      <span className="eyebrow-sm">{label}</span>
      <div className="flex h-9 items-center justify-center">{children}</div>
    </div>
  );
}

export function BreakDemo() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [step, setStep] = useState(reduce ? 2 : 0);
  const [miss, setMiss] = useState(0);

  // Advance through the steps while visible.
  useEffect(() => {
    if (reduce || !inView) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEPS[step].ms);
    return () => clearTimeout(t);
  }, [step, inView, reduce]);

  // While hunting, cycle through inputs that do not break the claim.
  useEffect(() => {
    if (step !== 1 || reduce) return;
    const t = setInterval(() => setMiss((m) => (m + 1) % DEMO_MISSES.length), 480);
    return () => clearInterval(t);
  }, [step, reduce]);

  const v: DemoVector = step >= 2 ? DEMO_HIT : DEMO_MISSES[step === 1 ? miss : 0];
  const evaluating = step >= 1;
  const broken = step >= 2;
  const result = broken ? 1 : 0;

  return (
    <section id="demo" className="container mt-16">
      <div ref={ref} className="card grid grid-cols-1 gap-6 !p-5 md:!p-8 lg:grid-cols-[280px_1fr]">
        <ol className="flex flex-col gap-2">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                onClick={() => setStep(i)}
                className={cn(
                  'relative flex w-full items-start gap-3 overflow-hidden rounded-[var(--radius-md)] border-2 p-3 text-left transition-colors',
                  i === step ? 'border-line bg-bg-base' : 'border-transparent hover:border-line-muted',
                )}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-2', i === step ? 'border-accent-dark bg-moss-light text-[var(--btn-primary-text)]' : 'border-line text-accent')}>
                  <s.icon size={16} />
                </span>
                <span className="flex flex-col">
                  <span className="card-title">
                    {i + 1}. {s.title}
                  </span>
                  <span className="text-[length:var(--text-xs)] text-fg-secondary">{s.line}</span>
                </span>
                {i === step && !reduce && inView && (
                  <motion.span
                    key={`bar-${step}`}
                    className="absolute bottom-0 left-0 h-[3px] bg-olive"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: s.ms / 1000, ease: 'linear' }}
                  />
                )}
              </button>
            </li>
          ))}
        </ol>

        <LayoutGroup>
          <div className="flex flex-col gap-5">
            {/* The claim */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 border-line bg-bg-base p-4">
              <div className="flex flex-col">
                <span className="eyebrow-sm">Claim</span>
                <span className="card-title">Target B behaves exactly like ADD8C</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-line">{step >= 1 && step <= 2 && <Coin />}</div>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={broken ? 'broken' : 'open'}
                    initial={reduce ? false : { scale: 1.6, rotate: -8, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className={cn('badge text-[length:var(--text-sm)]', broken ? 'badge-broken' : 'badge-open')}
                  >
                    {broken ? 'BROKEN' : 'OPEN'}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            {/* TapeOut evaluates the miter on x */}
            <div className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 rounded-[var(--radius-md)] border-2 border-line bg-bg-base p-4 transition-opacity', !evaluating && 'opacity-40')}>
              <span className="eyebrow-sm">Input x</span>
              <span className="flex flex-wrap items-center gap-2">
                <BitRow value={v.a} width={8} />
                <BitRow value={v.b} width={8} />
                <BitRow value={v.cin} width={1} />
              </span>
              <span className="mono text-[length:var(--text-sm)] text-fg-secondary">
                {v.a} + {v.b} + {v.cin}
              </span>

              <span className="eyebrow-sm">Target B</span>
              <BitRow value={v.target} width={9} diff={broken ? v.spec : undefined} />
              <span className={cn('mono text-[length:var(--text-sm)]', broken ? 'font-semibold text-danger' : 'text-fg')}>{v.target}</span>

              <span className="eyebrow-sm">ADD8C</span>
              <BitRow value={v.spec} width={9} />
              <span className="mono text-[length:var(--text-sm)] text-fg">{v.spec}</span>

              <span className="eyebrow-sm">Miter</span>
              <span className="text-[length:var(--text-xs)] text-fg-muted">1 when they disagree</span>
              <motion.span
                key={`${result}-${step}`}
                initial={reduce || !broken ? false : { scale: 0.4 }}
                animate={{ scale: 1 }}
                className={cn(
                  'flex h-9 w-9 items-center justify-center justify-self-end rounded-full border-2 font-semibold',
                  result ? 'border-danger bg-danger-bg text-danger' : 'border-line bg-bg-surface text-fg-secondary',
                )}
              >
                {result}
              </motion.span>
            </div>

            {/* Where the bond is */}
            <div className="flex items-center justify-between gap-4">
              <Wallet label="Owner" active={step === 0}>
                {step === 0 && <Coin />}
              </Wallet>
              <motion.div className="h-[2px] flex-1 bg-line" animate={{ opacity: step === 0 || step === 3 ? 1 : 0.3 }} />
              <Wallet label="Hunter" active={step === 3}>
                {step === 3 && <Coin />}
              </Wallet>
            </div>
          </div>
        </LayoutGroup>
      </div>
    </section>
  );
}
