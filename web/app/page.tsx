import fs from 'node:fs';
import path from 'node:path';
import { Faq } from '@/components/landing/faq';
import { FiguresStrip } from '@/components/landing/figures';
import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingImage } from '@/components/landing/landing-image';
import { BreakDemo } from '@/components/landing/break-demo';
import { WhyTrust } from '@/components/landing/why-trust';
import { ForceLight } from '@/components/theme-toggle';

/** PNG width and height from its IHDR chunk. */
function pngSize(file: string): { width: number; height: number } | null {
  try {
    const b = fs.readFileSync(file);
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } catch {
    return null;
  }
}

export default function Landing() {
  // hero.png is a real mainnet screenshot captured after deployment; until it exists the slot is omitted.
  const hero = pngSize(path.join(process.cwd(), 'public', 'hero.png'));
  return (
    <>
      <ForceLight />
      <main className="flex-1">
        <Hero />
        <BreakDemo />
        {hero && <LandingImage width={hero.width} height={hero.height} />}
        <div className="mt-20">
          <FiguresStrip />
        </div>
        <HowItWorks />
        <WhyTrust />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
