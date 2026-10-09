// Local development only: deploys the vendored TapeOut stack (factory behind an ERC-1967 proxy,
// real beacons and VM) to a local node, puts Multicall3 at its canonical address, and records
// the factory in deployments/<chainId>.json so scripts 01–04 and the web app can run locally.
import hre from 'hardhat';
import { encodeFunctionData, parseEther } from 'viem';
import { MULTICALL3 } from './constants';
import { readDeployments, writeDeployments } from './lib';

async function main() {
  const pc = await hre.viem.getPublicClient();
  const chainId = await pc.getChainId();
  if (chainId === 196) throw new Error('local-tapeout.ts must not run against X Layer');
  const [owner, protocolWallet] = await hre.viem.getWalletClients();

  const mc = await hre.artifacts.readArtifact('Multicall3');
  const method = (await pc.request({ method: 'web3_clientVersion' as never })) as string;
  const setCode = /anvil/i.test(method) ? 'anvil_setCode' : 'hardhat_setCode';
  await pc.request({ method: setCode as never, params: [MULTICALL3, mc.deployedBytecode] as never });

  const tImpl = await hre.viem.deployContract('Transistors');
  const cImpl = await hre.viem.deployContract('Circuits');
  const fImpl = await hre.viem.deployContract('CircuitFactory');
  const init = encodeFunctionData({
    abi: fImpl.abi,
    functionName: 'initialize',
    args: [owner.account.address, tImpl.address, cImpl.address, protocolWallet.account.address, parseEther('0.0066'), parseEther('0.00066')],
  });
  const proxy = await hre.viem.deployContract('TestProxy', [fImpl.address, init]);
  // A second, identical Circuits implementation lets local tests exercise the upgrade watcher.
  const altImpl = await hre.viem.deployContract('Circuits');

  const d = readDeployments(chainId, proxy.address);
  Object.assign(d, { factory: proxy.address, local: { owner: owner.account.address, circuitImpl: cImpl.address, altCircuitImpl: altImpl.address } });
  delete d.tapebook;
  delete d.circuits;
  delete d.claims;
  delete d.specs;
  delete d.seedClaims;
  delete d.broken;
  delete d.deployer;
  writeDeployments(d);
  console.log(`[local] TapeOut factory ${proxy.address} on chain ${chainId}; Multicall3 at ${MULTICALL3}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
