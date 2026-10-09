import path from 'node:path';
import type { NextConfig } from 'next';

const root = path.join(__dirname, '..');

const nextConfig: NextConfig = {
  // Off on purpose: /api/index and /api/versions use `export const revalidate`, which is only
  // valid in the previous caching model (PRD section 9).
  cacheComponents: false,
  // web/ imports ../core (netlist and miter encoding) and ../contracts/abi.
  outputFileTracingRoot: root,
  turbopack: {
    root,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
