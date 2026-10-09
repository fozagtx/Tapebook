'use client';

import { FaqAccordion } from '@/components/ui/faq-accordion';

const ITEMS = [
  { question: 'What does a claim mean?', answer: 'The circuit behaves exactly like the chosen spec on every input. Check who wrote the spec.' },
  { question: 'Who can post one?', answer: 'Only the circuit’s owner.' },
  { question: 'What happens to the bond?', answer: 'It goes to whoever breaks the claim; otherwise the claimant takes it back after the lock.' },
  { question: 'What does “open” mean?', answer: 'Nobody has broken it yet. It does not mean the circuit is correct.' },
  { question: 'What does a TapeOut upgrade change?', answer: 'Claims stay open and breakable; claimants may take their bond back early.' },
  { question: 'What does it cost?', answer: 'A few NAND at 0.0001 OKB each, one 0.0013 OKB tape-out fee, gas, and any bond up to 1 OKB.' },
];

export function Faq() {
  return (
    <section className="container py-24">
      <span className="eyebrow">Questions</span>
      <h2 className="mt-2 font-serif text-[length:var(--text-4xl)] leading-[var(--leading-tight)] text-accent">Questions, briefly.</h2>
      <FaqAccordion items={ITEMS} title="" className="tb-faq mt-8 max-w-[var(--max-width-prose)] mx-0" />
    </section>
  );
}
