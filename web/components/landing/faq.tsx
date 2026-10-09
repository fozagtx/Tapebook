'use client';

import { FaqAccordion } from '@/components/ui/faq-accordion';

const ITEMS = [
  {
    question: 'What does a claim mean?',
    answer:
      'That a circuit behaves exactly like a spec circuit on every input. It is only as meaningful as the spec, and the claimant chooses the spec, so every claim shows the spec’s name, owner and source.',
  },
  {
    question: 'Who can post one?',
    answer: 'Only the owner of the circuit. Posting tapes out a small miter circuit on the Tapebook processor and calls post on the claims contract.',
  },
  {
    question: 'What happens to the bond?',
    answer:
      'It sits in the claims contract. If someone breaks the claim, it is credited to them. Otherwise the claimant can take it back after the lock ends (at least one day for a bonded claim), or earlier if TapeOut’s circuit logic changes.',
  },
  {
    question: 'What does “open” mean, and what does it not mean?',
    answer:
      'Open means nobody has submitted a counterexample yet. It does not mean the circuit is correct: a circuit cannot be proven correct on chain, only proven wrong with one input.',
  },
  {
    question: 'What does a TapeOut upgrade change?',
    answer:
      'TapeOut can replace the circuit logic for all processors until it is sealed. Tapebook detects the change, flags claims posted under older logic, re-runs its conformance check, and lets claimants leave early. Claims stay open and breakable.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Posting a claim burns 4·n + 3·(n − 1) Tapebook NAND for a circuit with n outputs (0.0001 OKB each), plus one mint protocol fee and TapeOut’s 0.0013 OKB tape-out fee, plus gas and any bond (at most 1 OKB). Hunting is free; breaking a claim costs two transactions of gas.',
  },
];

export function Faq() {
  return (
    <section className="container py-24">
      <span className="eyebrow">Questions</span>
      <h2 className="mt-2 font-serif text-[length:var(--text-4xl)] leading-[var(--leading-tight)] text-accent">Before you stake or hunt.</h2>
      <FaqAccordion items={ITEMS} title="" className="tb-faq mt-8 max-w-[var(--max-width-prose)] mx-0" />
    </section>
  );
}
