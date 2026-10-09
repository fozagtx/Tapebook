import hre from 'hardhat';
import { expect } from 'chai';
import { loadFixture, mine, time } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { encodeAbiParameters, keccak256, parseEther, parseEventLogs, type Address, type Hex } from 'viem';
import { bytesToHex, packInt } from '../core/bits';
import { deployClaimsWithMiters } from './fixture';
import { tx } from './util';

// PRD section 15: following TapeOut upgrades.

const DAY = 86_400n;
const X383 = bytesToHex(packInt(383, 17));
const X0 = bytesToHex(packInt(0, 17));

function commitment(claimId: bigint, x: Hex, sender: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }], [claimId, x, sender]));
}

async function withClaims() {
  const t = await deployClaimsWithMiters();
  const P = t.circuits.address;
  const bond = parseEther('0.5');
  await tx(t.claims.write.post([P, t.ids.TARGET_A, t.ids.ADD8C, t.miterA, 30n * DAY], { value: bond, account: t.me }));
  await tx(t.claims.write.post([P, t.ids.TARGET_B, t.ids.ADD8C, t.miterB, 30n * DAY], { value: bond, account: t.me }));
  return { ...t, bond, claimA: 1n, claimB: 2n };
}

describe('TapeOut upgrades', function () {
  it('a circuit logic upgrade enables early reclaimBond; the claim stays Open and challengeable', async function () {
    const t = await loadFixture(withClaims);
    await expect(t.claims.write.reclaimBond([t.claimB], { account: t.me })).to.be.rejectedWith('StillLocked');

    const newImpl = await hre.viem.deployContract('Circuits');
    await tx(t.factory.write.upgradeCircuits([newImpl.address], { account: t.owner.account }));
    expect((await t.claims.read.currentImpl()).toLowerCase()).to.equal(newImpl.address.toLowerCase());
    const c = await t.claims.read.getClaim([t.claimB]);
    expect(c.circuitImpl.toLowerCase()).to.equal(t.cImpl.address.toLowerCase());

    // Same logic under a new address: conformance still passes.
    expect(await t.claims.read.conformance()).to.deep.equal(Array(8).fill(true));

    await tx(t.claims.write.reclaimBond([t.claimB], { account: t.me }));
    expect(await t.claims.read.credit([t.me])).to.equal(t.bond);
    expect((await t.claims.read.getClaim([t.claimB])).status).to.equal(1);

    // Still challengeable; the Broken event carries the logic in force.
    await tx(t.claims.write.commit([commitment(t.claimB, X383, t.hunter)], { account: t.hunter }));
    await mine(1);
    const r = await tx(t.claims.write.challenge([t.claimB, X383], { account: t.hunter }));
    const [ev] = parseEventLogs({ abi: t.claims.abi, logs: r.logs, eventName: 'Broken' });
    expect(ev.args.bondPaid).to.equal(0n);
    expect(ev.args.circuitImpl.toLowerCase()).to.equal(newImpl.address.toLowerCase());
  });

  it('conformance() passes on the vendored source and fails against a deliberately altered VM', async function () {
    const t = await loadFixture(withClaims);
    expect(await t.claims.read.conformance()).to.deep.equal(Array(8).fill(true));
    expect(await t.claims.read.differs([t.claimA, X0])).to.equal(false);

    const altered = await hre.viem.deployContract('AlteredCircuits');
    await tx(t.factory.write.upgradeCircuits([altered.address], { account: t.owner.account }));
    expect(await t.claims.read.conformance()).to.deep.equal(Array(8).fill(false));
    // Under the altered logic the correct Target A suddenly "differs": the reason claims
    // record the logic version and the claimant may leave early.
    expect(await t.claims.read.differs([t.claimA, X0])).to.equal(true);
    await tx(t.claims.write.reclaimBond([t.claimA], { account: t.me }));
    expect(await t.claims.read.credit([t.me])).to.equal(t.bond);

    // Back to the vendored logic: conformance passes again.
    await tx(t.factory.write.upgradeCircuits([t.cImpl.address], { account: t.owner.account }));
    expect(await t.claims.read.conformance()).to.deep.equal(Array(8).fill(true));
  });

  it('fee changes are read live and seal() freezes upgrades', async function () {
    const t = await loadFixture(withClaims);
    await tx(t.factory.write.setDeployFee([parseEther('0.01')], { account: t.owner.account }));
    expect(await t.factory.read.deployFee()).to.equal(parseEther('0.01'));
    // A Transistors clone keeps the protocol fee it was created with.
    await tx(t.factory.write.setProtocolFee([parseEther('0.001')], { account: t.owner.account }));
    expect(await t.transistors.read.protocolFee()).to.equal(parseEther('0.00066'));

    await tx(t.factory.write.seal({ account: t.owner.account }));
    expect(await t.factory.read.isSealed()).to.equal(true);
    const newImpl = await hre.viem.deployContract('Circuits');
    await expect(t.factory.write.upgradeCircuits([newImpl.address], { account: t.owner.account })).to.be.rejected;
    // Locks hold again once logic can no longer change.
    await expect(t.claims.write.reclaimBond([t.claimA], { account: t.me })).to.be.rejectedWith('StillLocked');
    await time.increase(30n * DAY);
    await tx(t.claims.write.reclaimBond([t.claimA], { account: t.me }));
  });
});
