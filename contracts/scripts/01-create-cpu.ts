// createCPU("Tapebook", "TBOOK", story, 1000000, 0.0001 OKB) with value = factory.deployFee() read live.
import { formatEther } from 'viem';
import { CPU } from './constants';
import { context, log } from './context';
import { createCpu, factoryAt, writeDeployments } from './lib';

async function main() {
  const { d, me } = await context();
  if (d.tapebook) {
    log('01', `skip: Tapebook processor already created at ${d.tapebook.circuits} (tx ${d.tapebook.createTx})`);
    return;
  }
  const f = await factoryAt(d.factory);
  log('01', `factory ${d.factory}, deployFee ${formatEther(await f.read.deployFee())} OKB, sealed ${await f.read.isSealed()}`);
  const r = await createCpu(d.factory, CPU, me);
  d.tapebook = {
    circuits: r.circuits,
    transistors: r.transistors,
    createTx: r.hash,
    story: CPU.story,
    supply: CPU.supply.toString(),
    mintPrice: CPU.mintPrice.toString(),
  };
  writeDeployments(d);
  log('01', `Tapebook processor (Circuits) ${r.circuits}, Transistors ${r.transistors}, tx ${r.hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
