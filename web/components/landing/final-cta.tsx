import Link from 'next/link';

export function FinalCta() {
  return (
    <section className="bg-[var(--card-bg-featured)] py-20">
      <div className="container flex flex-col items-center gap-6 text-center">
        <p className="font-serif text-[length:var(--text-4xl)] leading-[var(--leading-tight)] text-[var(--btn-primary-text)]">
          Every open claim is a standing bounty.
        </p>
        <Link href="/book" className="btn btn-lg bg-bg-surface text-accent hover:bg-bg-elevated">
          Open the Book
        </Link>
      </div>
    </section>
  );
}
