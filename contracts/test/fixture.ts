// Local TapeOut stack: the vendored factory behind an ERC-1967 proxy, real beacons, real VM.
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther, type Address, type Hex } from 'viem';
import { buildMiter } from '../core/miter';
import { SEEDS, SPEC_KEYS, seed, type SeedKey } from '../circuits';
import { VECTORS, vectorBytes } from '../circuits/vectors';
import { createCpu, mintAndTapeout, waitFor } from '../scripts/lib';

export const DEPLOY_FEE = parseEther('0.0066');
export const PROTOCOL_FEE = parseEther('0.00066');
export const MINT_PRICE = 100_000_000_000_000n; // 0.0001 OKB
export const SUPPLY = 1_000_000n;
export const STORY =
  'Tapebook: bonded, breakable claims about TapeOut circuits. Supply 1,000,000 NAND (the cap), 0.0001 OKB each.';

export async function deployTapeOut() {
  const [owner, protocolWallet] = await hre.viem.getWalletClients();
  const tImpl = await hre.viem.deployContract('Transistors');
  const cImpl = await hre.viem.deployContract('Circuits');
  const fImpl = await hre.viem.deployContract('CircuitFactory');
  const init = encodeFunctionData({
    abi: fImpl.abi,
    functionName: 'initialize',
    args: [owner.account.address, tImpl.address, cImpl.address, protocolWallet.account.address, DEPLOY_FEE, PROTOCOL_FEE],
  });
  const proxy = await hre.viem.deployContract('TestProxy', [fImpl.address, init]);
  const factory = await hre.viem.getContractAt('CircuitFactory', proxy.address);
  return { factory, owner, protocolWallet, tImpl, cImpl, fImpl };
}

/** TapeOut + the Tapebook processor + the six seed circuits. */
export async function deployTapebook() {
  const base = await deployTapeOut();
  const [, , deployer] = await hre.viem.getWalletClients();
  const me = deployer.account.address;
  const cpu = await createCpu(
    base.factory.address,
    { name: 'Tapebook', symbol: 'TBOOK', story: STORY, supply: SUPPLY, mintPrice: MINT_PRICE },
    me,
  );
  const circuits = await hre.viem.getContractAt('Circuits', cpu.circuits);
  const transistors = await hre.viem.getContractAt('Transistors', cpu.transistors);
  const ids = {} as Record<SeedKey, bigint>;
  for (const s of SEEDS) {
    const r = await mintAndTapeout(cpu.circuits, cpu.transistors, me, s.build());
    ids[s.key] = r.id;
  }
  return { ...base, deployer, me, circuits, transistors, ids };
}

export function conformanceArgs(ids: Record<SeedKey, bigint>) {
  const specIds = VECTORS.map((v) => ids[v.spec]);
  const ins = VECTORS.map((v) => vectorBytes(v).input);
  const outs = VECTORS.map((v) => vectorBytes(v).output);
  return [specIds, ins, outs] as const;
}

/** Everything above plus TapebookClaims and registered seed specs. */
export async function deployClaims() {
  const t = await deployTapebook();
  const [specIds, ins, outs] = conformanceArgs(t.ids);
  const claims = await hre.viem.deployContract('TapebookClaims', [
    t.factory.address,
    t.circuits.address,
    [...specIds],
    [...ins],
    [...outs],
  ]);
  for (const k of SPEC_KEYS) {
    await waitFor(
      await claims.write.registerSpec(
        [t.ids[k], seed(k).name, `https://github.com/fozagtx/Tapebook/blob/main/contracts/circuits/${k.toLowerCase()}.ts`],
        { account: t.me },
      ),
    );
  }
  return { ...t, claims };
}

/** Tapes out the miter for (cpu, id) against `specId` on the Tapebook processor. */
export async function tapeoutMiter(
  t: { circuits: { address: Address }; transistors: { address: Address } },
  owner: Address,
  target: { cpu: Address; id: bigint; nIn: number; nOut: number },
  specId: bigint,
) {
  const m = buildMiter({
    tapebook: t.circuits.address,
    cpu: target.cpu,
    id: target.id,
    specId,
    nIn: target.nIn,
    nOut: target.nOut,
  });
  const r = await mintAndTapeout(t.circuits.address, t.transistors.address, owner, m);
  return { miterId: r.id, netlist: m.netlist as Hex };
}

export function addr(a: string): Address {
  return getAddress(a);
}

/** Claims contract plus the miters of Target A and Target B against ADD8C. */
export async function deployClaimsWithMiters() {
  const t = await deployClaims();
  const target = (id: bigint) => ({ cpu: t.circuits.address, id, nIn: 17, nOut: 9 });
  const a = await tapeoutMiter(t, t.me, target(t.ids.TARGET_A), t.ids.ADD8C);
  const b = await tapeoutMiter(t, t.me, target(t.ids.TARGET_B), t.ids.ADD8C);
  const wallets = await hre.viem.getWalletClients();
  return { ...t, miterA: a.miterId, miterB: b.miterId, hunter: wallets[3].account.address, other: wallets[4].account.address };
}
