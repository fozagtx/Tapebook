// Resolves the chain, deployer and TapeOut factory for a script run.
import hre from 'hardhat';
import { getAddress, type Address } from 'viem';
import { XLAYER_FACTORY } from './constants';
import { readDeployments } from './lib';

export async function context() {
  const pc = await hre.viem.getPublicClient();
  const [wallet] = await hre.viem.getWalletClients();
  if (!wallet) throw new Error('no deployer account: set DEPLOYER_KEY');
  const chainId = await pc.getChainId();
  let factory: Address | undefined;
  if (chainId === 196) factory = XLAYER_FACTORY;
  else if (process.env.TAPEOUT_FACTORY) factory = process.env.TAPEOUT_FACTORY as Address;
  const d = readDeployments(chainId, (factory ?? '0x') as Address);
  factory = factory ?? d.factory;
  if (!factory || factory === '0x') throw new Error(`no TapeOut factory for chain ${chainId}: set TAPEOUT_FACTORY or run scripts/local-tapeout.ts`);
  d.factory = getAddress(factory);
  d.deployer = d.deployer ?? wallet.account.address;
  if (d.deployer.toLowerCase() !== wallet.account.address.toLowerCase())
    throw new Error(`deployments/${chainId}.json was written by ${d.deployer}, but the signer is ${wallet.account.address}`);
  return { pc, wallet, me: wallet.account.address, chainId, d };
}

export function log(step: string, msg: string) {
  console.log(`[${step}] ${msg}`);
}
