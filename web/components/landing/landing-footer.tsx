'use client';

import { useReducedMotion } from 'framer-motion';
import { AnimatedFooter } from '@/components/ui/animated-footer';
import { BOTTOM_LINE, FooterLinks } from '@/components/footer';
import { useCssVar } from '@/lib/hooks';

export function LandingFooter() {
  const reduce = useReducedMotion();
  // Canvas needs concrete colours, so the token values are read from the document.
  const moss = useCssVar('--color-moss');
  const olive = useCssVar('--color-olive');
  const surface = useCssVar('--color-bg-surface');
  return (
    <footer className="mt-0">
      <div className="container flex flex-col gap-8 py-16">
        <FooterLinks readOnly />
      </div>
      <div className="h-[420px] md:h-[520px]">
        {moss && (
          <AnimatedFooter
            headingLines={['Tapebook']}
            leftImage="/footer-left.png"
            rightImage="/footer-right.png"
            background="var(--color-bg-elevated)"
            textColor="var(--color-moss)"
            charColor={moss}
            hoverColor={olive}
            hoverCharColor={surface}
            revealOnScroll={!reduce}
            parallaxStrength={reduce ? 0 : 20}
          />
        )}
      </div>
      <div className="container py-6">
        <p className="text-[length:var(--text-xs)] text-fg-muted">{BOTTOM_LINE}</p>
      </div>
    </footer>
  );
}
