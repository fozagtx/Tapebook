// Tapes out the miters of Target A and Target B against ADD8C and posts both claims.
// Target A's claim stays OPEN; Target B's is meant to be broken through Hunt.
import hre from 'hardhat';
import { formatEther, parseEventLogs } from 'viem';
import { buildMiter } from '../../core/miter';
import { SEED_CLAIMS } from './constants';
import { context, log } from './context';
import { findCircuit, mintAndTapeout, waitFor, writeDeployments } from './lib';

async function main() {
  const { d, me } = await context();
  if (!d.tapebook || !d.circuits || !d.claims) throw new Error('run 01, 02 and 03 first');
  const claims = await hre.viem.getContractAt('TapebookClaims', d.claims.address);
  const specId = BigInt(d.circuits.ADD8C.id);
  d.seedClaims = d.seedClaims ?? {};

  for (const [label, cfg] of Object.entries(SEED_CLAIMS)) {
    if (d.seedClaims[label]) {
      log('04', `skip: claim on ${cfg.target} is claim ${d.seedClaims[label].claimId}`);
      continue;
    }
    const target = d.circuits[cfg.target];
    const id = BigInt(target.id);
    const miter = buildMiter({ tapebook: d.tapebook.circuits, cpu: d.tapebook.circuits, id, specId, nIn: target.nIn, nOut: target.nOut });

    let miterId = await findCircuit(d.tapebook.circuits, miter.netlist, me);
    if (miterId === null) {
      const r = await mintAndTapeout(d.tapebook.circuits, d.tapebook.transistors, me, miter);
      miterId = r.id;
      log('04', `miter(${cfg.target}, ADD8C): circuit ${miterId}, ${miter.nand} NAND burned, tx ${r.hash}`);
    }
    d.circuits[`MITER_${cfg.target}`] = { id: miterId.toString(), tx: '0x', nIn: target.nIn, nOut: 1, nand: miter.nand, kind: 'miter' };
    writeDeployments(d);

    const key = await claims.read.claimKey([d.tapebook.circuits, id, specId]);
    const open = await claims.read.openClaimOf([key]);
    if (open !== 0n) {
      d.seedClaims[label] = { claimId: open.toString(), miter: miterId.toString(), tx: '0x', bond: '?' };
      writeDeployments(d);
      log('04', `found open claim ${open} on ${cfg.target}`);
      continue;
    }
    const hash = await claims.write.post([d.tapebook.circuits, id, specId, miterId, cfg.lock], { value: cfg.bond, account: me });
    const receipt = await waitFor(hash);
    const [ev] = parseEventLogs({ abi: claims.abi, logs: receipt.logs, eventName: 'Posted' });
    d.seedClaims[label] = { claimId: ev.args.claimId.toString(), miter: miterId.toString(), tx: hash, bond: cfg.bond.toString() };
    writeDeployments(d);
    log('04', `claim ${ev.args.claimId} on ${cfg.target} vs ADD8C, bond ${formatEther(cfg.bond)} OKB, tx ${hash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
