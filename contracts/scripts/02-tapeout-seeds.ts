// Tapes out the four seed specs and the two reference targets on the Tapebook processor.
// Per circuit: mint(0, n) with value = n·mintPrice() + transistors.protocolFee(), then
// tapeout with value = TAPEOUT_FEE(); all read live. Skips circuits already recorded.
import { SEEDS } from '../circuits';
import { context, log } from './context';
import { findCircuit, mintAndTapeout, writeDeployments } from './lib';

async function main() {
  const { d, me } = await context();
  if (!d.tapebook) throw new Error('run 01-create-cpu.ts first');
  d.circuits = d.circuits ?? {};
  for (const s of SEEDS) {
    if (d.circuits[s.key]) {
      log('02', `skip: ${s.key} is circuit ${d.circuits[s.key].id}`);
      continue;
    }
    const built = s.build();
    if (built.nand !== s.expectedNand) throw new Error(`${s.key}: builder emits ${built.nand} NAND, expected ${s.expectedNand}`);
    // Resume safely if a previous run taped out but crashed before recording.
    const existing = await findCircuit(d.tapebook.circuits, built.netlist, me);
    if (existing !== null) {
      d.circuits[s.key] = { id: existing.toString(), tx: '0x', nIn: built.nIn, nOut: built.nOut, nand: built.nand, kind: s.kind };
      log('02', `found ${s.key} already taped out as circuit ${existing}`);
    } else {
      const r = await mintAndTapeout(d.tapebook.circuits, d.tapebook.transistors, me, built);
      d.circuits[s.key] = { id: r.id.toString(), tx: r.hash, mintTx: r.mintHash, nIn: built.nIn, nOut: built.nOut, nand: built.nand, kind: s.kind };
      log('02', `${s.key}: circuit ${r.id}, ${built.nand} NAND burned, tx ${r.hash}`);
    }
    writeDeployments(d);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
