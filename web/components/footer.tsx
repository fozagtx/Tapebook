// Footer link columns and bottom line, shared by the landing page and the compact app footer.
import Link from 'next/link';
import { REPO_URL, TAPEBOOK, TAPEOUT_URL, XLAYER_URL } from '@/lib/config';
import { explorerAddress } from '@/lib/format';

function Col({ title, links }: { title: string; links: { label: string; href: string | null }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">{title}</span>
      {links.map((l) =>
        l.href ? (
          l.href.startsWith('/') ? (
            <Link key={l.label} href={l.href} className="nav-link !p-0">
              {l.label}
            </Link>
          ) : (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="nav-link !p-0">
              {l.label}
            </a>
          )
        ) : (
          <span key={l.label} className="nav-link !p-0 opacity-60" title="Not deployed yet">
            {l.label}
          </span>
        ),
      )}
    </div>
  );
}

/** `readOnly` (landing page): only pages that need no wallet. */
export function FooterLinks({ readOnly = false }: { readOnly?: boolean }) {
  const claims = TAPEBOOK.claims ? explorerAddress(TAPEBOOK.claims) : null;
  const processor = TAPEBOOK.circuits ? explorerAddress(TAPEBOOK.circuits) : null;
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
      <Col
        title="Product"
        links={[
          { label: 'Book', href: '/book' },
          { label: 'Specs', href: '/specs' },
          ...(readOnly ? [] : [{ label: 'My account', href: '/account' }]),
        ]}
      />
      <Col
        title="Protocol"
        links={[
          { label: 'Claims contract on OKLink', href: claims },
          { label: 'Tapebook processor on OKLink', href: processor },
          { label: 'TapeOut', href: TAPEOUT_URL },
          { label: 'X Layer', href: XLAYER_URL },
        ]}
      />
      <Col
        title="Project"
        links={[
          { label: 'GitHub', href: REPO_URL },
          { label: 'README', href: `${REPO_URL}#readme` },
          { label: 'Contact', href: `${REPO_URL}/issues` },
        ]}
      />
    </div>
  );
}

export const BOTTOM_LINE = 'Unaudited. Bonds are capped at 1 OKB. Not financial advice.';

export function CompactFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container flex flex-col gap-8 py-12">
        <FooterLinks />
        <p className="text-[length:var(--text-xs)] text-fg-muted">{BOTTOM_LINE}</p>
      </div>
    </footer>
  );
}
