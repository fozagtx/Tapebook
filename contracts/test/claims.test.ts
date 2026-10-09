import hre from 'hardhat';
import { expect } from 'chai';
import { loadFixture, mine, time } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { encodeAbiParameters, encodeFunctionData, keccak256, parseEther, parseEventLogs, toFunctionSelector, type Address, type Hex } from 'viem';
import { NetlistBuilder } from '../core/netlist';
import { bytesToHex, packInt } from '../core/bits';
import { halfAdder5 } from '../circuits/targetA';
import { mintAndTapeout } from '../scripts/lib';
import { deployClaimsWithMiters, tapeoutMiter } from './fixture';
import { tx } from './util';

const DAY = 86_400n;
const X383 = bytesToHex(packInt(383, 17)); // a = 127, b = 1, cin = 0: Target B's lowest fault
const X0 = bytesToHex(packInt(0, 17));

function commitment(claimId: bigint, x: Hex, sender: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }], [claimId, x, sender]));
}

type F = Awaited<ReturnType<typeof deployClaimsWithMiters>>;

async function post(t: F, which: 'A' | 'B', bond = parseEther('0.5'), lock = DAY) {
  const id = which === 'A' ? t.ids.TARGET_A : t.ids.TARGET_B;
  const miter = which === 'A' ? t.miterA : t.miterB;
  const receipt = await tx(t.claims.write.post([t.circuits.address, id, t.ids.ADD8C, miter, lock], { value: bond, account: t.me }));
  const [ev] = parseEventLogs({ abi: t.claims.abi, logs: receipt.logs, eventName: 'Posted' });
  return ev.args.claimId;
}

async function commitAndWait(t: F, claimId: bigint, x: Hex, account: Address) {
  await tx(t.claims.write.commit([commitment(claimId, x, account)], { account }));
  await mine(1);
}

/** A faulty adder (Target B's fault) padded with `pad` dead NAND so the miter hits a chosen gateCount. */
function paddedFaultyAdder(pad: number) {
  const b = new NetlistBuilder(17);
  let carry = b.input(16);
  const sums: number[] = [];
  const carries: number[] = [];
  for (let i = 0; i < 8; i++) {
    const h1 = halfAdder5(b, b.input(i), b.input(8 + i));
    const h2 = halfAdder5(b, h1.sum, carry);
    carry = b.or(h1.carry, h2.carry);
    sums.push(h2.sum);
    carries.push(carry);
  }
  let s = b.input(0);
  for (let i = 0; i < pad; i++) s = b.nand(s, s);
  b.outputStage([...sums, carries[6]]);
  return b.build(9);
}

describe('TapebookClaims', function () {
  describe('deployment, specs, conformance', function () {
    it('stores factory, Tapebook processor, beacon and conformance vectors', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      expect((await t.claims.read.factory()).toLowerCase()).to.equal(t.factory.address.toLowerCase());
      expect((await t.claims.read.tapebook()).toLowerCase()).to.equal(t.circuits.address.toLowerCase());
      expect((await t.claims.read.circuitBeacon()).toLowerCase()).to.equal((await t.factory.read.circuitBeacon()).toLowerCase());
      expect((await t.claims.read.currentImpl()).toLowerCase()).to.equal(t.cImpl.address.toLowerCase());
      expect(await t.claims.read.conformance()).to.deep.equal(Array(8).fill(true));
      expect(await t.claims.read.conformanceCount()).to.equal(8n);
    });

    it('rejects mismatched or oversized conformance vectors', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const args = (n: number, m = n) =>
        [t.factory.address, t.circuits.address, Array(n).fill(t.ids.ADD8C), Array(m).fill(X0), Array(n).fill('0x0500')] as const;
      // Constructor reverts are reported by selector.
      const badVectors = new RegExp(`BadVectors|${toFunctionSelector('BadVectors()')}`);
      await expect(hre.viem.deployContract('TapebookClaims', [...args(2, 1)] as never)).to.be.rejectedWith(badVectors);
      await expect(hre.viem.deployContract('TapebookClaims', [...args(17)] as never)).to.be.rejectedWith(badVectors);
    });

    it('registerSpec: owner only, stateless only, updatable', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const [owner, name, uri] = await t.claims.read.specs([t.ids.ADD8C]);
      expect([owner.toLowerCase(), name]).to.deep.equal([t.me.toLowerCase(), 'ADD8C']);
      expect(uri).to.contain('add8c.ts');
      await expect(t.claims.write.registerSpec([t.ids.MAJ5, 'x', 'y'], { account: t.hunter })).to.be.rejectedWith('NotSpecOwner');
      await tx(t.claims.write.registerSpec([t.ids.MAJ5, 'MAJ5 v2', 'ipfs://new'], { account: t.me }));
      expect((await t.claims.read.specs([t.ids.MAJ5]))[1]).to.equal('MAJ5 v2');

      const b = new NetlistBuilder(1);
      const q = b.latch(2);
      b.outputStage([q]);
      const built = b.build(1);
      await tx(t.transistors.write.mint([1n, 1n], { value: (await t.transistors.read.mintPrice()) + (await t.transistors.read.protocolFee()), account: t.me }));
      const { id } = await mintAndTapeout(t.circuits.address, t.transistors.address, t.me, built);
      await expect(t.claims.write.registerSpec([id, 'stateful', ''], { account: t.me })).to.be.rejectedWith('StatefulCircuit');
    });
  });

  describe('post', function () {
    it('records the claim, its target hash and the logic version', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const claimId = await post(t, 'A', parseEther('0.25'), 2n * DAY);
      expect(claimId).to.equal(1n);
      const c = await t.claims.read.getClaim([claimId]);
      expect(c.cpu.toLowerCase()).to.equal(t.circuits.address.toLowerCase());
      expect([c.id, c.specId, c.miterId, c.bond, c.status, c.nIn]).to.deep.equal([t.ids.TARGET_A, t.ids.ADD8C, t.miterA, parseEther('0.25'), 1, 17]);
      expect(c.lockUntil - c.postedAt).to.equal(2n * DAY);
      expect(c.targetHash).to.equal(keccak256(await t.circuits.read.netlist([t.ids.TARGET_A])));
      expect(c.circuitImpl.toLowerCase()).to.equal(t.cImpl.address.toLowerCase());
      expect(await t.claims.read.openClaimOf([await t.claims.read.claimKey([t.circuits.address, t.ids.TARGET_A, t.ids.ADD8C])])).to.equal(1n);
      // An unbonded claim needs no lock.
      expect(await post(t, 'B', 0n, 0n)).to.equal(2n);
    });

    it('test 5: reverts for non-owner, wrong miter, shape mismatch, stateful target, bond over cap, short lock', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const P = t.circuits.address;
      const A = t.ids.TARGET_A;
      const S = t.ids.ADD8C;
      // non-owner
      await expect(t.claims.write.post([P, A, S, t.miterA, DAY], { account: t.hunter })).to.be.rejectedWith('NotCircuitOwner');
      // wrong miter (Target B's miter for Target A)
      await expect(t.claims.write.post([P, A, S, t.miterB, DAY], { account: t.me })).to.be.rejectedWith('WrongMiter');
      // shape mismatch (MAJ5 is 5 in / 1 out, ADD8C is 17 / 9)
      await expect(t.claims.write.post([P, t.ids.MAJ5, S, t.miterA, DAY], { account: t.me })).to.be.rejectedWith('ShapeMismatch');
      // stateful target with ADD8C's pin layout
      const b = new NetlistBuilder(17);
      const q = b.latch(2);
      b.outputStage([q, ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => b.input(i))]);
      const stateful = b.build(9);
      await tx(t.transistors.write.mint([1n, 1n], { value: (await t.transistors.read.mintPrice()) + (await t.transistors.read.protocolFee()), account: t.me }));
      const { id: sid } = await mintAndTapeout(P, t.transistors.address, t.me, stateful);
      expect((await t.circuits.read.circuitInfo([sid]))[2]).to.equal(1);
      await expect(t.claims.write.post([P, sid, S, t.miterA, DAY], { account: t.me })).to.be.rejectedWith('StatefulCircuit');
      // bond over cap
      await expect(t.claims.write.post([P, A, S, t.miterA, DAY], { account: t.me, value: parseEther('1') + 1n })).to.be.rejectedWith('BondTooLarge');
      // short lock on a bonded claim
      await expect(t.claims.write.post([P, A, S, t.miterA, DAY - 1n], { account: t.me, value: 1n })).to.be.rejectedWith('LockTooShort');
      // not a registered processor
      await expect(t.claims.write.post([t.claims.address, A, S, t.miterA, DAY], { account: t.me })).to.be.rejectedWith('NotACPU');
      // a second open claim on the same (cpu, id, spec)
      await tx(t.claims.write.post([P, A, S, t.miterA, DAY], { account: t.me, value: parseEther('1') }));
      await expect(t.claims.write.post([P, A, S, t.miterA, DAY], { account: t.me })).to.be.rejectedWith('ClaimAlreadyOpen');
    });
  });

  describe('commit and challenge', function () {
    it('commit never reverts and keeps the earliest block', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const h = commitment(1n, X383, t.hunter);
      expect(await t.claims.read.commitment([1n, X383, t.hunter])).to.equal(h);
      await tx(t.claims.write.commit([h], { account: t.hunter }));
      const first = await t.claims.read.commitBlock([h]);
      await mine(3);
      await tx(t.claims.write.commit([h], { account: t.other })); // a copy is a no-op
      expect(await t.claims.read.commitBlock([h])).to.equal(first);
    });

    it('test 6: challenge reverts without a commit, with a same-block commit, or with another sender’s commit', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const claimId = await post(t, 'B');
      await expect(t.claims.write.challenge([claimId, X383], { account: t.hunter })).to.be.rejectedWith('NoCommitment');

      // another sender's commitment does not authorize the hunter
      await commitAndWait(t, claimId, X383, t.other);
      await expect(t.claims.write.challenge([claimId, X383], { account: t.hunter })).to.be.rejectedWith('NoCommitment');

      // commit and challenge in the same block
      const pc = await hre.viem.getPublicClient();
      await hre.network.provider.send('evm_setAutomine', [false]);
      try {
        await t.claims.write.commit([commitment(claimId, X383, t.hunter)], { account: t.hunter, gas: 100_000n });
        const ch = await t.claims.write.challenge([claimId, X383], { account: t.hunter, gas: 5_000_000n });
        await mine(1);
        const r = await pc.waitForTransactionReceipt({ hash: ch });
        expect(r.status).to.equal('reverted');
      } finally {
        await hre.network.provider.send('evm_setAutomine', [true]);
      }
      await expect(
        pc.simulateContract({ address: t.claims.address, abi: t.claims.abi, functionName: 'challenge', args: [claimId, X383], account: t.hunter, blockTag: 'pending' }),
      ).to.not.be.rejected;
      expect((await t.claims.read.getClaim([claimId])).status).to.equal(1);
      // one block later the same commitment works
      await tx(t.claims.write.challenge([claimId, X383], { account: t.hunter }));
      expect((await t.claims.read.getClaim([claimId])).status).to.equal(2);
    });

    it('test 7: a non-counterexample reverts and changes nothing', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const claimId = await post(t, 'B');
      const before = await t.claims.read.getClaim([claimId]);
      expect(await t.claims.read.differs([claimId, X0])).to.equal(false);
      await commitAndWait(t, claimId, X0, t.hunter);
      await expect(t.claims.write.challenge([claimId, X0], { account: t.hunter })).to.be.rejectedWith('NotACounterexample');
      expect(await t.claims.read.getClaim([claimId])).to.deep.equal(before);
      expect(await t.claims.read.credit([t.hunter])).to.equal(0n);
    });

    it('test 8: a counterexample breaks the claim and credits the bond once', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const bond = parseEther('0.4');
      const claimId = await post(t, 'B', bond);
      expect(await t.claims.read.differs([claimId, X383])).to.equal(true);
      await commitAndWait(t, claimId, X383, t.hunter);
      const pc = await hre.viem.getPublicClient();
      const receipt = await tx(t.claims.write.challenge([claimId, X383], { account: t.hunter }));
      const [ev] = parseEventLogs({ abi: t.claims.abi, logs: receipt.logs, eventName: 'Broken' });
      expect(ev.args.x).to.equal(X383);
      expect(ev.args.bondPaid).to.equal(bond);
      expect(ev.args.circuitImpl.toLowerCase()).to.equal(t.cImpl.address.toLowerCase());

      const c = await t.claims.read.getClaim([claimId]);
      expect([c.status, c.bond, c.counterexample, c.breaker.toLowerCase()]).to.deep.equal([2, 0n, X383, t.hunter.toLowerCase()]);
      expect(await t.claims.read.credit([t.hunter])).to.equal(bond);
      expect(await t.claims.read.openClaimOf([await t.claims.read.claimKey([t.circuits.address, t.ids.TARGET_B, t.ids.ADD8C])])).to.equal(0n);

      await expect(t.claims.write.challenge([claimId, X383], { account: t.hunter })).to.be.rejectedWith('NotOpen');
      expect(await t.claims.read.credit([t.hunter])).to.equal(bond);

      const bal = await pc.getBalance({ address: t.hunter });
      const w = await tx(t.claims.write.withdraw({ account: t.hunter }));
      expect(await pc.getBalance({ address: t.hunter })).to.equal(bal + bond - w.gasUsed * w.effectiveGasPrice);
      await expect(t.claims.write.withdraw({ account: t.hunter })).to.be.rejectedWith('NothingToWithdraw');
      expect(await pc.getBalance({ address: t.claims.address })).to.equal(0n);
      // differs still answers for a broken claim; unknown claims revert
      expect(await t.claims.read.differs([claimId, X383])).to.equal(true);
      await expect(t.claims.read.differs([99n, X383])).to.be.rejectedWith('UnknownClaim');
    });

    it('test 9: a non-canonical input reverts', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const claimId = await post(t, 'B');
      for (const x of ['0x7f01', '0x7f010000', '0x7f0102', '0x7f0180'] as Hex[]) {
        await expect(t.claims.read.differs([claimId, x])).to.be.rejectedWith('NonCanonicalInput');
        await commitAndWait(t, claimId, x, t.hunter);
        await expect(t.claims.write.challenge([claimId, x], { account: t.hunter })).to.be.rejectedWith('NonCanonicalInput');
      }
    });
  });

  describe('bonds', function () {
    it('test 10: reclaimBond reverts before the lock, credits after it, reverts after Broken', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const bond = parseEther('0.3');
      const claimId = await post(t, 'A', bond, 3n * DAY);
      await expect(t.claims.write.reclaimBond([claimId], { account: t.me })).to.be.rejectedWith('StillLocked');
      await expect(t.claims.write.reclaimBond([claimId], { account: t.hunter })).to.be.rejectedWith('NotClaimant');
      await time.increase(3n * DAY);
      await tx(t.claims.write.reclaimBond([claimId], { account: t.me }));
      expect(await t.claims.read.credit([t.me])).to.equal(bond);
      const c = await t.claims.read.getClaim([claimId]);
      expect([c.status, c.bond]).to.deep.equal([1, 0n]); // stays Open, unbonded
      await expect(t.claims.write.reclaimBond([claimId], { account: t.me })).to.be.rejectedWith('NoBond');

      const b = await post(t, 'B', bond, DAY);
      await commitAndWait(t, b, X383, t.hunter);
      await tx(t.claims.write.challenge([b, X383], { account: t.hunter }));
      await time.increase(DAY);
      await expect(t.claims.write.reclaimBond([b], { account: t.me })).to.be.rejectedWith('NotOpen');
    });

    it('topUp: claimant only, open only, capped at MAX_BOND', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const claimId = await post(t, 'B', parseEther('0.6'));
      await expect(t.claims.write.topUp([claimId], { account: t.hunter, value: 1n })).to.be.rejectedWith('NotClaimant');
      await expect(t.claims.write.topUp([claimId], { account: t.me, value: parseEther('0.4') + 1n })).to.be.rejectedWith('BondTooLarge');
      await tx(t.claims.write.topUp([claimId], { account: t.me, value: parseEther('0.4') }));
      expect((await t.claims.read.getClaim([claimId])).bond).to.equal(parseEther('1'));
      await commitAndWait(t, claimId, X383, t.hunter);
      await tx(t.claims.write.challenge([claimId, X383], { account: t.hunter }));
      expect(await t.claims.read.credit([t.hunter])).to.equal(parseEther('1'));
      await expect(t.claims.write.topUp([claimId], { account: t.me, value: 1n })).to.be.rejectedWith('NotOpen');
    });

    it('test 11: a reentrant receiver on withdraw is paid once', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const bond = parseEther('0.7');
      const claimId = await post(t, 'B', bond);
      const r = await hre.viem.deployContract('ReentrantReceiver', [t.claims.address]);
      await tx(r.write.commit([commitment(claimId, X383, r.address)]));
      await mine(1);
      await tx(r.write.challenge([claimId, X383]));
      expect(await t.claims.read.credit([r.address])).to.equal(bond);
      await tx(r.write.withdraw());
      const pc = await hre.viem.getPublicClient();
      expect(await pc.getBalance({ address: r.address })).to.equal(bond);
      expect(await r.read.reentries()).to.equal(1n);
      expect(await r.read.reentrySucceeded()).to.equal(false);
      expect(await t.claims.read.credit([r.address])).to.equal(0n);
      expect(await pc.getBalance({ address: t.claims.address })).to.equal(0n);
    });
  });

  describe('gas', function () {
    it('test 13: challenge at MAX_GATES (miter gateCount 1000), and 1001 is refused', async function () {
      const t = await loadFixture(deployClaimsWithMiters);
      const P = t.circuits.address;
      const big = paddedFaultyAdder(728); // 122 + 728 = 850; miter = 850 + 90 + 60 = 1000
      const { id } = await mintAndTapeout(P, t.transistors.address, t.me, big);
      expect((await t.circuits.read.circuitInfo([id]))[3]).to.equal(850);
      const { miterId } = await tapeoutMiter(t, t.me, { cpu: P, id, nIn: 17, nOut: 9 }, t.ids.ADD8C);
      expect((await t.circuits.read.circuitInfo([miterId]))[3]).to.equal(1000);

      const pc = await hre.viem.getPublicClient();
      await tx(t.claims.write.post([P, id, t.ids.ADD8C, miterId, DAY], { account: t.me, value: parseEther('0.1') }));
      const claimId = await t.claims.read.claimCount();
      const evalGas = await pc.estimateGas({ to: P, data: encodeFunctionData({ abi: t.circuits.abi, functionName: 'eval', args: [miterId, X383] }) });
      await commitAndWait(t, claimId, X383, t.hunter);
      const receipt = await tx(t.claims.write.challenge([claimId, X383], { account: t.hunter }));
      expect(receipt.status).to.equal('success');
      console.log(`      gas: challenge at MAX_GATES = ${receipt.gasUsed} (miter eval alone ≈ ${evalGas})`);
      expect(receipt.gasUsed < 10_000_000n).to.equal(true);

      const bigger = paddedFaultyAdder(729);
      const { id: id2 } = await mintAndTapeout(P, t.transistors.address, t.me, bigger);
      const { miterId: m2 } = await tapeoutMiter(t, t.me, { cpu: P, id: id2, nIn: 17, nOut: 9 }, t.ids.ADD8C);
      await expect(t.claims.write.post([P, id2, t.ids.ADD8C, m2, DAY], { account: t.me })).to.be.rejectedWith('TooManyGates');
    });
  });
});
