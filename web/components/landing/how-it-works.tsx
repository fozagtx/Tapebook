'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Coins, Lock, Search } from 'lucide-react';
import { EASE, SLOW } from './motion';
import { MiterDiagram } from './miter-diagram';

const STEPS = [
  { n: 1, icon: Lock, title: 'Stake.', body: 'A circuit’s owner picks a spec and locks OKB behind “my circuit matches it”.' },
  { n: 2, icon: Search, title: 'Hunt.', body: 'Anyone searches for one input where the circuit and the spec disagree. The chain does the checking.' },
  { n: 3, icon: Coins, title: 'Get paid.', body: 'Submit that input. The claim is marked BROKEN and the OKB goes to the finder.' },
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  return (
    <section id="how-it-works" className="container scroll-mt-28 py-24">
      <span className="eyebrow">How it works</span>
      <h2 className="mt-2 font-serif text-[length:var(--text-4xl)] leading-[var(--leading-tight)] text-accent">Stake, hunt, get paid.</h2>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            className="card flex flex-col gap-4"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: SLOW, ease: EASE, delay: i * 0.08 }}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-olive-bg text-moss">
                <s.icon size={20} />
              </span>
              <span className="display-figure text-fg-muted">{s.n}</span>
            </div>
            <div>
              <h3 className="card-title">{s.title}</h3>
              <p className="card-desc mt-1">{s.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-14 flex justify-center">
        <MiterDiagram />
      </div>
    </section>
  );
}
