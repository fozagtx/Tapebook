// Shared helpers for deploy scripts and tests. Every fee is read from chain before use.
import hre from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';
import { parseEventLogs, type Address, type Hex } from 'viem';

export type Circuits = Awaited<ReturnType<typeof circuitsAt>>;
export type Transistors = Awaited<ReturnType<typeof transistorsAt>>;

export async function circuitsAt(address: Address) {
  return hre.viem.getContractAt('Circuits', address);
}
export async function transistorsAt(address: Address) {
  return hre.viem.getContractAt('Transistors', address);
}
export async function factoryAt(address: Address) {
  return hre.viem.getContractAt('CircuitFactory', address);
}

export async function waitFor(hash: Hex) {
  const pc = await hre.viem.getPublicClient();
  const receipt = await pc.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`transaction reverted: ${hash}`);
  return receipt;
}

/** createCPU with value = factory.deployFee() read live; returns the addresses from CPUCreated. */
export async function createCpu(
  factory: Address,
  args: { name: string; symbol: string; story: string; supply: bigint; mintPrice: bigint },
  account?: Address,
) {
  const f = await factoryAt(factory);
  const deployFee = await f.read.deployFee();
  const hash = await f.write.createCPU([args.name, args.symbol, args.story, args.supply, args.mintPrice], {
    value: deployFee,
    ...(account ? { account } : {}),
  });
  const receipt = await waitFor(hash);
  const [ev] = parseEventLogs({ abi: f.abi, logs: receipt.logs, eventName: 'CPUCreated' });
  if (!ev) throw new Error('CPUCreated not emitted');
  return { circuits: ev.args.circuits, transistors: ev.args.transistors, hash, deployFee };
}

/** Mints exactly the NAND still missing for `nand` (value = mintPrice·n + this clone's protocolFee). */
export async function ensureNand(transistors: Address, owner: Address, nand: bigint): Promise<Hex | null> {
  const t = await transistorsAt(transistors);
  const have = await t.read.balanceOf([owner, 0n]);
  if (have >= nand) return null;
  const need = nand - have;
  const [price, fee] = await Promise.all([t.read.mintPrice(), t.read.protocolFee()]);
  const hash = await t.write.mint([0n, need], { value: price * need + fee, account: owner });
  await waitFor(hash);
  return hash;
}

/** Tapes out a netlist (value = TAPEOUT_FEE() read live); returns the new circuit id. */
export async function tapeout(
  circuits: Address,
  owner: Address,
  built: { netlist: Hex; nIn: number; nOut: number },
): Promise<{ id: bigint; hash: Hex }> {
  const c = await circuitsAt(circuits);
  const fee = await c.read.TAPEOUT_FEE();
  const hash = await c.write.tapeout([built.netlist, built.nIn, built.nOut], { value: fee, account: owner });
  const receipt = await waitFor(hash);
  const [ev] = parseEventLogs({ abi: c.abi, logs: receipt.logs, eventName: 'TapedOut' });
  if (!ev) throw new Error('TapedOut not emitted');
  return { id: ev.args.circuitId, hash };
}

/** Mint what is missing, then tape out. */
export async function mintAndTapeout(
  circuits: Address,
  transistors: Address,
  owner: Address,
  built: { netlist: Hex; nIn: number; nOut: number; nand: number },
) {
  const mintHash = await ensureNand(transistors, owner, BigInt(built.nand));
  const r = await tapeout(circuits, owner, built);
  return { ...r, mintHash };
}

/** Finds an existing circuit on `circuits` whose netlist equals `netlist`, owned by `owner`. */
export async function findCircuit(circuits: Address, netlist: Hex, owner?: Address): Promise<bigint | null> {
  const c = await circuitsAt(circuits);
  const n = await c.read.nextId();
  for (let id = 1n; id <= n; id++) {
    const nl = await c.read.netlist([id]);
    if (nl.toLowerCase() !== netlist.toLowerCase()) continue;
    if (owner && (await c.read.ownerOf([id])).toLowerCase() !== owner.toLowerCase()) continue;
    return id;
  }
  return null;
}

// ------------------------------------------------------------------ deployments/<chainId>.json

export interface Deployments {
  chainId: number;
  factory: Address;
  deployer?: Address;
  tapebook?: { circuits: Address; transistors: Address; createTx: Hex; story: string; supply: string; mintPrice: string };
  circuits?: Record<string, { id: string; tx: Hex; mintTx?: Hex | null; nIn: number; nOut: number; nand: number; kind: string }>;
  claims?: { address: Address; tx: Hex; args: unknown[] };
  specs?: Record<string, { tx: Hex }>;
  seedClaims?: Record<string, { claimId: string; miter: string; tx: Hex; bond: string }>;
  broken?: Record<string, { commitTx: Hex; challengeTx: Hex; x: Hex }>;
}

export function deploymentsPath(chainId: number) {
  return path.join(__dirname, '..', 'deployments', `${chainId}.json`);
}

export function readDeployments(chainId: number, factory: Address): Deployments {
  const p = deploymentsPath(chainId);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return { chainId, factory };
}

export function writeDeployments(d: Deployments) {
  const p = deploymentsPath(d.chainId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
}
