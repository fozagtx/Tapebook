// Shell for the Book, Circuit, Claim, Hunt and Specs pages.
import type { ReactNode } from 'react';
import { CompactFooter } from './footer';
import { ThemeToggle } from './theme-toggle';
import { VersionBanner } from './version-banner';

export function AppPage({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="container w-full flex-1 pt-[120px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <VersionBanner />
          <ThemeToggle />
        </div>
        {children}
      </main>
      <CompactFooter />
    </>
  );
}
