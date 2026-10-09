// Writes .env.local for running the web app against a local node seeded by
// `npm run local:deploy` in contracts/ (reads contracts/deployments/31337.json).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(root, '..', 'contracts', 'deployments', '31337.json'), 'utf8'));
const rpc = process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545';
const lines = [
  `NEXT_PUBLIC_LOCAL_RPC_URL=${rpc}`,
  `NEXT_PUBLIC_TAPEOUT_FACTORY=${d.factory}`,
  `NEXT_PUBLIC_CLAIMS_ADDRESS=${d.claims?.address ?? ''}`,
  `NEXT_PUBLIC_TAPEBOOK_CIRCUITS=${d.tapebook?.circuits ?? ''}`,
  `NEXT_PUBLIC_TAPEBOOK_TRANSISTORS=${d.tapebook?.transistors ?? ''}`,
];
fs.writeFileSync(path.join(root, '.env.local'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
