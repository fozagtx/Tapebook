'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import Image from 'next/image';
import { useRef } from 'react';
import { EASE, SLOWER } from './motion';

/** public/hero.png: a real screenshot of a Tapebook circuit page on mainnet (web/scripts/capture-hero.mjs). */
export function LandingImage({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [2, 0]);
  return (
    <div ref={ref} className="container relative z-[var(--z-raised)] -mb-16 mt-16 flex justify-center [perspective:1200px]">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: SLOWER, ease: EASE, delay: 0.6 }}
        style={reduce ? undefined : { rotateX }}
        className="w-full max-w-[1040px] overflow-hidden rounded-[var(--radius-lg)] border border-line bg-bg-surface shadow-lg"
      >
        <Image src="/hero.png" alt="A Tapebook circuit page on X Layer mainnet with a claim on it" width={width} height={height} className="h-auto w-full" priority />
      </motion.div>
    </div>
  );
}
