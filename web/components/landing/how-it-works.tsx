'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE, SLOW } from './motion';
import { MiterDiagram } from './miter-diagram';

const STEPS = [
  { n: 1, title: 'Stake.', body: 'A circuit’s owner picks a spec and locks OKB behind “my circuit matches it”.' },
  { n: 2, title: 'Hunt.', body: 'Anyone searches for one input where the circuit and the spec disagree. The chain does the checking.' },
  { n: 3, title: 'Get paid.', body: 'Submit that input. The claim is marked BROKEN and the OKB goes to the finder.' },
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  return (
    <section id="how-it-works" className="container scroll-mt-28 py-24">
      <span className="eyebrow">How it works</span>
      <h2 className="mt-2 font-serif text-[length:var(--text-4xl)] leading-[var(--leading-tight)] text-accent">A claim anyone can break with one input.</h2>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            className="card"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: SLOW, ease: EASE, delay: i * 0.08 }}
          >
            <span className="display-figure">{s.n}</span>
            <h3 className="card-title mt-4">{s.title}</h3>
            <p className="card-desc mt-2">{s.body}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-12 flex flex-col items-center gap-3">
        <MiterDiagram />
        <p className="max-w-[var(--max-width-prose)] text-center text-[length:var(--text-sm)] text-fg-secondary">
          The miter is a circuit on the Tapebook processor. It references the target and the spec, compares every output pin and returns 1
          exactly on inputs where they disagree. Breaking a claim is one call to TapeOut’s own <span className="mono">eval</span>.
        </p>
      </div>
    </section>
  );
}
