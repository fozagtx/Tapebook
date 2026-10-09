// Local development only: breaks the seed claim on Target B the way a hunter would — search with
// `differs` (TapeOut's eval via eth_call), then commit, wait one block, challenge.
import hre from 'hardhat';
import { encodeAbiParameters, keccak256 } from 'viem';
import { bytesToHex, packInt } from '../../core/bits';
import { readDeployments, waitFor, writeDeployments } from './lib';

async function main() {
  const pc = await hre.viem.getPublicClient();
  const chainId = await pc.getChainId();
  if (chainId === 196) throw new Error('local only');
  const d = readDeployments(chainId, '0x');
  if (!d.claims || !d.seedClaims?.B) throw new Error('run local-tapeout and 01–04 first');
  const claims = await hre.viem.getContractAt('TapebookClaims', d.claims.address);
  const claimId = BigInt(d.seedClaims.B.claimId);
  const c = await claims.read.getClaim([claimId]);
  if (c.status !== 1) return console.log(`[local] claim ${claimId} is not open`);
  const hunter = (await hre.viem.getWalletClients())[3].account.address;
  let x: `0x${string}` | null = null;
  for (let v = 0; v < 2 ** c.nIn && !x; v++) {
    const cand = bytesToHex(packInt(v, c.nIn));
    if (await claims.read.differs([claimId, cand])) x = cand;
  }
  if (!x) throw new Error('no counterexample found');
  const h = keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }], [claimId, x, hunter]));
  const commitTx = await claims.write.commit([h], { account: hunter });
  await waitFor(commitTx);
  await pc.request({ method: 'evm_mine' as never });
  const challengeTx = await claims.write.challenge([claimId, x], { account: hunter });
  await waitFor(challengeTx);
  d.broken = { ...(d.broken ?? {}), B: { commitTx, challengeTx, x } };
  writeDeployments(d);
  console.log(`[local] claim ${claimId} broken by ${hunter} with x = ${x}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
