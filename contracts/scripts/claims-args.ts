// Constructor arguments of TapebookClaims for `hardhat verify --constructor-args scripts/claims-args.ts`.
// Read from deployments/<chainId>.json (CHAIN_ID env, default 196) so they always match the deploy.
import fs from 'node:fs';
import path from 'node:path';

const chainId = process.env.CHAIN_ID ?? '196';
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployments', `${chainId}.json`), 'utf8'));
if (!d.claims) throw new Error(`no claims deployment recorded for chain ${chainId}`);

export default d.claims.args;
