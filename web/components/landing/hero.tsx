'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AnimatedButton from '@/components/ui/animated-button';
import TextAnimation from '@/components/ui/staggerText';
import { primaryVersions, useVersions } from '@/lib/api';
import { DASH, shortAddr } from '@/lib/format';
import { useRise } from './motion';

const HEADLINE = 'The bug bounty layer for TapeOut circuits.';

export function Hero() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const after = 0.1 + HEADLINE.split(' ').length * 0.04 + 0.3; // once the headline has landed
  const rise = useRise(12, after);
  const { data, isLoading } = useVersions();
  const v = primaryVersions(data);

  return (
    <section className="container flex flex-col items-center pt-[160px] text-center">
      <span className="eyebrow mb-6">On X Layer · TapeOut</span>
      <h1 className="display-hero max-w-[980px]">{reduce ? HEADLINE : <TextAnimation delay={0.1} stagger={0.04}>{HEADLINE}</TextAnimation>}</h1>
      <motion.p {...rise} className="mt-6 max-w-[var(--max-width-sm)] text-[length:var(--text-md)] text-fg-secondary">
        Stake OKB on your circuit. One input that breaks it takes the stake.
      </motion.p>
      <motion.div {...rise} className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <AnimatedButton
          onClick={() => router.push('/book')}
          className="h-[var(--btn-height-lg)] rounded-[var(--radius-pill)] border-moss bg-moss px-6 text-[var(--btn-primary-text)] [--shine:var(--color-olive-light)] hover:bg-moss-light"
        >
          Open the Book
        </AnimatedButton>
        <Link href="/claim" className="btn btn-ghost btn-lg">
          Post a claim
        </Link>
      </motion.div>
      <motion.span
        {...rise}
        className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-line px-3 py-1 text-[length:var(--text-2xs)] text-fg-muted"
        title={v?.circuitImpl ?? undefined}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${v ? 'bg-success' : 'bg-line-strong'}`} />
        {isLoading ? 'reading chain' : `logic ${v ? shortAddr(v.circuitImpl) : DASH} · block ${v ? v.block.number : DASH}`}
      </motion.span>
    </section>
  );
}
