'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AnimatedButton from '@/components/ui/animated-button';
import TextAnimation from '@/components/ui/staggerText';
import { primaryVersions, useVersions } from '@/lib/api';
import { DASH, shortAddr } from '@/lib/format';
import { useRise } from './motion';

const HEADLINE = 'One input can prove a circuit wrong.';

export function Hero() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const words = HEADLINE.split(' ').length;
  const after = 0.1 + words * 0.04 + 0.3; // starts once the headline has landed
  const rise = useRise(12, after);
  const { data, isLoading } = useVersions();
  const v = primaryVersions(data);

  return (
    <section className="container flex flex-col items-center pt-[160px] text-center">
      <span className="eyebrow mb-6">On X Layer · TapeOut</span>
      <h1 className="display-hero max-w-[960px]">
        {reduce ? HEADLINE : <TextAnimation delay={0.1} stagger={0.04}>{HEADLINE}</TextAnimation>}
      </h1>
      <motion.p {...rise} className="mt-6 max-w-[var(--max-width-sm)] text-[length:var(--text-md)] text-fg-secondary">
        Tapebook is a bug bounty layer for TapeOut circuits. Owners bond OKB behind “my circuit matches this spec”; anyone who finds
        one input where the two disagree takes the bond, checked by TapeOut’s own on-chain eval.
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
      <motion.p {...rise} className="mt-4 text-[length:var(--text-xs)] text-fg-muted">
        {isLoading
          ? 'Reading TapeOut logic version…'
          : v
            ? `TapeOut circuit logic ${shortAddr(v.circuitImpl)} · block ${v.block.number}${v.isSealed ? ' · sealed' : ' · not sealed'}`
            : `TapeOut circuit logic ${DASH} · block ${DASH}`}
      </motion.p>
    </section>
  );
}
