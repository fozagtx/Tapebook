'use client';
import { useReducedMotion } from 'framer-motion';

/** Motion presets from the tokens (--ease-default, --duration-slow/-slower). Under reduced motion,
 *  `initial` is false so content renders in its final state. */
export const EASE = [0.16, 1, 0.3, 1] as const;
export const SLOW = 0.32;
export const SLOWER = 0.4;

export function useRise(distance: number, delay = 0, duration = SLOWER) {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? false : { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: { duration, ease: EASE, delay },
  } as const;
}
