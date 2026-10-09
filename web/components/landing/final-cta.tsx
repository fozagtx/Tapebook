'use client';

import { useOpenBook } from '@/components/wallet';

export function FinalCta() {
  const book = useOpenBook();
  return (
    <section className="bg-[var(--card-bg-featured)] py-20">
      <div className="container flex flex-col items-center gap-6 text-center">
        <p className="font-serif text-[length:var(--text-4xl)] leading-[var(--leading-tight)] text-[var(--btn-primary-text)]">
          Every open claim is a standing bounty.
        </p>
        <button type="button" onClick={book.onClick} className="btn btn-lg bg-bg-surface text-accent hover:bg-bg-elevated">
          {book.label}
        </button>
      </div>
    </section>
  );
}
