'use client';

// The landing hero is read-only: nothing here needs a wallet (PRD 12a; wallet actions live in /account).
import { motion, useReducedMotion } from 'framer-motion';
import { AsciiSpiral } from '@/components/ui/ascii-shapes';
import AnimatedButton from '@/components/ui/animated-button';
import TextAnimation from '@/components/ui/staggerText';
import { useOpenBook } from '@/components/wallet';
import { primaryVersions, useVersions } from '@/lib/api';
import { DASH, shortAddr } from '@/lib/format';
import { EASE, SLOWER, useRise } from './motion';

const HEADLINE = 'The bug bounty layer for TapeOut circuits.';

export function Hero() {
  const book = useOpenBook();
  const reduce = useReducedMotion();
  const after = 0.1 + HEADLINE.split(' ').length * 0.04 + 0.3; // once the headline has landed
  const rise = useRise(12, after);
  const { data, isLoading } = useVersions();
  const v = primaryVersions(data);

  return (
    <section className="container grid grid-cols-1 items-center gap-12 pt-[140px] lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col items-start text-left">
        <span className="eyebrow mb-5">On X Layer · TapeOut</span>
        <h1 className="display-hero !text-left">{reduce ? HEADLINE : <TextAnimation delay={0.1} stagger={0.04}>{HEADLINE}</TextAnimation>}</h1>
        <motion.p {...rise} className="mt-6 max-w-[600px] text-[length:var(--text-md)] text-fg-secondary">
          Stake OKB on your circuit. One input that breaks it takes the stake.
        </motion.p>
        <motion.div {...rise} className="mt-8 flex flex-wrap items-center gap-4">
          <AnimatedButton
            onClick={book.onClick}
            className="h-[var(--btn-height-lg)] rounded-[var(--radius-pill)] border-2 border-accent-dark bg-moss-light px-7 text-[var(--btn-primary-text)] shadow-sm [--shine:var(--color-cyan-light)] hover:bg-olive"
          >
            {book.label}
          </AnimatedButton>
          <span
            className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-2 border-line bg-bg-surface px-3 py-1 text-[length:var(--text-2xs)] text-fg-secondary"
            title={v?.circuitImpl ?? undefined}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${v ? 'bg-success' : 'bg-line-strong'}`} />
            {isLoading ? 'reading chain' : `logic ${v ? shortAddr(v.circuitImpl) : DASH} · block ${v ? v.block.number : DASH}`}
          </span>
        </motion.div>
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: SLOWER, ease: EASE, delay: 0.3 }}
        className="flex justify-center lg:justify-end"
      >
        <AsciiSpiral
          size="md"
          charset="classic"
          speed="slow"
          color="var(--color-cyan)"
          className="max-w-full rounded-[var(--radius-lg)] border-2 border-line bg-bg-surface p-5 text-[11px] leading-none shadow-lg sm:text-[15px] xl:text-[17px]"
        />
      </motion.div>
    </section>
  );
}
