// Version watcher (PRD section 15, measure 6): which TapeOut logic is in force, whether the
// factory is sealed, current fees, and the change history from the chain's own event logs.
import { getAddress, parseAbiItem, toEventSelector, type Address, type Hex, type PublicClient } from 'viem';
import { circuitFactoryAbi, ERC1967_IMPLEMENTATION_SLOT, tapebookClaimsAbi, upgradeableBeaconAbi } from './abi';
import { VERSIONS, type FactoryConfig } from './config';

const UPGRADED = parseAbiItem('event Upgraded(address indexed implementation)');
const SEALED = parseAbiItem('event Sealed()');
const DEPLOY_FEE_SET = parseAbiItem('event DeployFeeSet(uint256 value)');
const PROTOCOL_FEE_SET = parseAbiItem('event ProtocolFeeSet(uint256 value)');
const TOPICS = [UPGRADED, SEALED, DEPLOY_FEE_SET, PROTOCOL_FEE_SET].map((e) => toEventSelector(e));

export type ChangeKind = 'factoryImpl' | 'transistorImpl' | 'circuitImpl' | 'sealed' | 'deployFee' | 'protocolFee';

export interface Change {
  kind: ChangeKind;
  block: string;
  tx: Hex;
  /** New implementation address or fee in wei; empty for `sealed`. */
  value: string;
}

export interface Versions {
  chainId: number;
  block: { number: string; timestamp: string };
  factory: Address;
  factoryImpl: Address | null;
  transistorBeacon: Address | null;
  circuitBeacon: Address | null;
  transistorImpl: Address | null;
  circuitImpl: Address | null;
  isSealed: boolean | null;
  deployFee: string | null;
  protocolFee: string | null;
  owner: Address | null;
  /** Block where the circuit logic now in force was installed (latest circuitImpl change), if known. */
  circuitImplSince: string | null;
  claims: { address: Address; currentImpl: Address | null; conformance: boolean[] | null } | null;
  history: Change[];
  /** First block the log scan covered and whether it reached back to the factory's deployment. */
  historyFrom: string | null;
  historyComplete: boolean;
  errors: string[];
}

async function settle<T>(p: Promise<T>, errors: string[], what: string): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    errors.push(`${what}: ${(e as Error).message.split('\n')[0]}`);
    return null;
  }
}

/** First block at which `address` has code, by bisection over eth_getCode (needs historical state). */
export async function findDeployBlock(client: PublicClient, address: Address, latest: bigint): Promise<bigint> {
  let lo = 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.getCode({ address, blockNumber: mid });
    if (code && code !== '0x') hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

/** eth_getLogs over [from, to] in chunks; a failing chunk is halved down to VERSIONS.minLogChunk. */
async function scanLogs(client: PublicClient, addresses: Address[], from: bigint, to: bigint, errors: string[]) {
  const logs: Awaited<ReturnType<PublicClient['getLogs']>> = [];
  const ranges: [bigint, bigint][] = [];
  for (let a = from; a <= to; a += VERSIONS.logChunk) ranges.push([a, a + VERSIONS.logChunk - 1n > to ? to : a + VERSIONS.logChunk - 1n]);
  let complete = true;

  async function get(a: bigint, b: bigint): Promise<void> {
    try {
      const res = await client.request({
        method: 'eth_getLogs',
        params: [{ address: addresses, topics: [TOPICS as Hex[]], fromBlock: `0x${a.toString(16)}`, toBlock: `0x${b.toString(16)}` }],
      });
      logs.push(...(res as never[]));
    } catch (e) {
      if (b - a + 1n > VERSIONS.minLogChunk) {
        const mid = (a + b) / 2n;
        await get(a, mid);
        await get(mid + 1n, b);
      } else {
        complete = false;
        errors.push(`eth_getLogs ${a}-${b}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: VERSIONS.concurrency }, async () => {
      while (next < ranges.length) {
        const [a, b] = ranges[next++];
        await get(a, b);
      }
    }),
  );
  return { logs, complete };
}

export async function readVersions(
  client: PublicClient,
  factory: FactoryConfig,
  opts: { claims?: Address | null } = {},
): Promise<Versions> {
  const errors: string[] = [];
  const block = await client.getBlock({ blockTag: 'latest' });
  const bn = block.number;
  const chainId = await client.getChainId();
  const f = factory.address;

  const [slot, tBeacon, cBeacon, sealed, deployFee, protocolFee, owner] = await Promise.all([
    settle(client.getStorageAt({ address: f, slot: ERC1967_IMPLEMENTATION_SLOT, blockNumber: bn }), errors, 'factory implementation slot'),
    settle(client.readContract({ address: f, abi: circuitFactoryAbi, functionName: 'transistorBeacon', blockNumber: bn }), errors, 'transistorBeacon'),
    settle(client.readContract({ address: f, abi: circuitFactoryAbi, functionName: 'circuitBeacon', blockNumber: bn }), errors, 'circuitBeacon'),
    settle(client.readContract({ address: f, abi: circuitFactoryAbi, functionName: 'isSealed', blockNumber: bn }), errors, 'isSealed'),
    settle(client.readContract({ address: f, abi: circuitFactoryAbi, functionName: 'deployFee', blockNumber: bn }), errors, 'deployFee'),
    settle(client.readContract({ address: f, abi: circuitFactoryAbi, functionName: 'protocolFee', blockNumber: bn }), errors, 'protocolFee'),
    settle(client.readContract({ address: f, abi: circuitFactoryAbi, functionName: 'owner', blockNumber: bn }), errors, 'owner'),
  ]);
  const impl = (beacon: Address | null) =>
    beacon
      ? settle(client.readContract({ address: beacon, abi: upgradeableBeaconAbi, functionName: 'implementation', blockNumber: bn }), errors, `implementation@${beacon}`)
      : Promise.resolve(null);
  const [tImpl, cImpl] = await Promise.all([impl(tBeacon), impl(cBeacon)]);

  let claims: Versions['claims'] = null;
  if (opts.claims) {
    const [currentImpl, conformance] = await Promise.all([
      settle(client.readContract({ address: opts.claims, abi: tapebookClaimsAbi, functionName: 'currentImpl', blockNumber: bn }), errors, 'claims.currentImpl'),
      settle(client.readContract({ address: opts.claims, abi: tapebookClaimsAbi, functionName: 'conformance', blockNumber: bn }), errors, 'claims.conformance'),
    ]);
    claims = { address: opts.claims, currentImpl: currentImpl ?? null, conformance: conformance ? [...conformance] : null };
  }

  // Change history from logs: Upgraded on the factory proxy and both beacons, Sealed and fee setters.
  let from = factory.deployBlock;
  if (from === null) from = await settle(findDeployBlock(client, f, bn), errors, 'factory deploy block');
  const history: Change[] = [];
  let complete = false;
  if (from !== null) {
    const addresses = [f, tBeacon, cBeacon].filter(Boolean) as Address[];
    const scan = await scanLogs(client, addresses, from, bn, errors);
    complete = scan.complete;
    for (const log of scan.logs as unknown as { address: Address; topics: Hex[]; data: Hex; blockNumber: Hex; transactionHash: Hex }[]) {
      const at = getAddress(log.address);
      const topic = log.topics[0];
      let kind: ChangeKind | null = null;
      let value = '';
      if (topic === TOPICS[0]) {
        kind = at === getAddress(f) ? 'factoryImpl' : tBeacon && at === getAddress(tBeacon) ? 'transistorImpl' : 'circuitImpl';
        value = getAddress(`0x${log.topics[1].slice(26)}`);
      } else if (topic === TOPICS[1]) kind = 'sealed';
      else if (topic === TOPICS[2]) {
        kind = 'deployFee';
        value = BigInt(log.data).toString();
      } else if (topic === TOPICS[3]) {
        kind = 'protocolFee';
        value = BigInt(log.data).toString();
      }
      if (kind) history.push({ kind, block: BigInt(log.blockNumber).toString(), tx: log.transactionHash, value });
    }
    history.sort((a, b) => (BigInt(a.block) < BigInt(b.block) ? -1 : BigInt(a.block) > BigInt(b.block) ? 1 : 0));
  }
  const lastCircuit = [...history].reverse().find((h) => h.kind === 'circuitImpl');

  return {
    chainId,
    block: { number: bn.toString(), timestamp: block.timestamp.toString() },
    factory: f,
    factoryImpl: slot ? getAddress(`0x${slot.slice(26)}`) : null,
    transistorBeacon: tBeacon ?? null,
    circuitBeacon: cBeacon ?? null,
    transistorImpl: tImpl ?? null,
    circuitImpl: cImpl ?? null,
    isSealed: sealed ?? null,
    deployFee: deployFee === null ? null : deployFee.toString(),
    protocolFee: protocolFee === null ? null : protocolFee.toString(),
    owner: owner ?? null,
    circuitImplSince: lastCircuit ? lastCircuit.block : null,
    claims,
    history,
    historyFrom: from === null ? null : from.toString(),
    historyComplete: complete,
    errors,
  };
}
