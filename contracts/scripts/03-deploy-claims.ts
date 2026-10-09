// Deploys TapebookClaims(factory, tapebookCircuits, specIds, ins, outs) with the conformance
// vectors, registers the four seed specs, and checks conformance() passes on chain.
import hre from 'hardhat';
import { SPEC_KEYS, seed, type SeedKey } from '../circuits';
import { VECTORS, vectorBytes } from '../circuits/vectors';
import { sourceUri } from './constants';
import { context, log } from './context';
import { waitFor, writeDeployments } from './lib';

async function main() {
  const { d, me, pc } = await context();
  if (!d.tapebook || !d.circuits) throw new Error('run 01 and 02 first');
  const ids = Object.fromEntries(Object.entries(d.circuits).map(([k, v]) => [k, BigInt(v.id)])) as Record<SeedKey, bigint>;
  for (const k of SPEC_KEYS) if (ids[k] === undefined) throw new Error(`spec ${k} not taped out yet`);

  if (!d.claims) {
    const args = [
      d.factory,
      d.tapebook.circuits,
      VECTORS.map((v) => ids[v.spec].toString()),
      VECTORS.map((v) => vectorBytes(v).input),
      VECTORS.map((v) => vectorBytes(v).output),
    ];
    const { contract, deploymentTransaction } = await hre.viem.sendDeploymentTransaction('TapebookClaims', [
      d.factory,
      d.tapebook.circuits,
      VECTORS.map((v) => ids[v.spec]),
      VECTORS.map((v) => vectorBytes(v).input),
      VECTORS.map((v) => vectorBytes(v).output),
    ]);
    await pc.waitForTransactionReceipt({ hash: deploymentTransaction.hash });
    d.claims = { address: contract.address, tx: deploymentTransaction.hash, args };
    writeDeployments(d);
    log('03', `TapebookClaims ${contract.address}, tx ${deploymentTransaction.hash}`);
  } else {
    log('03', `skip: TapebookClaims already at ${d.claims.address}`);
  }

  const claims = await hre.viem.getContractAt('TapebookClaims', d.claims.address);
  d.specs = d.specs ?? {};
  for (const k of SPEC_KEYS) {
    const [owner] = await claims.read.specs([ids[k]]);
    if (owner.toLowerCase() === me.toLowerCase()) {
      log('03', `skip: spec ${k} (${ids[k]}) registered`);
      continue;
    }
    const hash = await claims.write.registerSpec([ids[k], seed(k).name, sourceUri(k)], { account: me });
    await waitFor(hash);
    d.specs[k] = { tx: hash };
    writeDeployments(d);
    log('03', `registered spec ${k} (${ids[k]}), tx ${hash}`);
  }

  const ok = await claims.read.conformance();
  log('03', `conformance: ${ok.map((v, i) => `${VECTORS[i].label} ${v ? 'pass' : 'FAIL'}`).join('; ')}`);
  if (!ok.every(Boolean)) throw new Error('conformance check failed on chain');
  log('03', `verify with: npx hardhat verify --network <net> --constructor-args scripts/claims-args.ts ${d.claims.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
