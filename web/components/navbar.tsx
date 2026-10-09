'use client';

// Floating pill navbar used on every page (PRD 19.2 item 1).
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SpotlightNavbar } from '@/components/ui/spotlight-navbar';
import { ConnectButton } from './wallet';

const LINKS = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Book', href: '/book' },
  { label: 'Specs', href: '/specs' },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (f: (o: boolean) => boolean) => setOpenOn(f(open) ? pathname : null);
  // Reads need no wallet; ConnectButton opens the ConnectKit modal when disconnected
  // and links to /account when connected, so it lives on every page.
  const active = LINKS.findIndex((l) => l.href !== '/#how-it-works' && pathname.startsWith(l.href));

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const go = (href: string) => {
    if (href.startsWith('http')) window.open(href, '_blank', 'noreferrer');
    else router.push(href);
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -8, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="tb-nav fixed left-1/2 top-4 z-[var(--z-sticky)] w-[min(720px,calc(100%-32px))]"
    >
      <div
        className="flex h-[52px] items-center justify-between gap-2 rounded-[var(--radius-pill)] border-2 border-line bg-bg-surface pl-5 pr-2 transition-shadow duration-[var(--duration-slow)]"
        style={{ boxShadow: scrolled ? 'var(--shadow-lg)' : 'var(--shadow-md)' }}
      >
        <Link href="/" className="wordmark text-accent">
          Tapebook
        </Link>
        <div className="hidden sm:block">
          <SpotlightNavbar
            key={pathname}
            items={LINKS}
            defaultActiveIndex={active}
            className="pt-0"
            onItemClick={(item) => go(item.href)}
          />
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:block">
            <ConnectButton compact />
          </div>
          <Link href="/book" className="btn btn-primary hidden sm:inline-flex">
            Open the Book
          </Link>
          <button className="btn btn-ghost sm:hidden" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="card mt-2 flex flex-col gap-1 !p-3 sm:hidden">
          {LINKS.map((l) => (
            <button key={l.href} className="nav-link text-left" onClick={() => go(l.href)}>
              {l.label}
            </button>
          ))}
          <div className="flex items-center gap-2 pt-2">
            <ConnectButton />
            <Link href="/book" className="btn btn-primary">
              Open the Book
            </Link>
          </div>
        </nav>
      )}
    </motion.header>
  );
}
