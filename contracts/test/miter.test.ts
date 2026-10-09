import hre from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { getAddress, keccak256, type Hex } from 'viem';
import { buildMiter, miterNand, miterSize } from '../../core/miter';
import { NetlistBuilder, decode, countBurn } from '../../core/netlist';
import { bytesToHex, packInt } from '../../core/bits';
import { SEEDS, seed } from '../circuits';
import { fullAdder9 } from '../circuits/add8c';
import { add8cRef } from '../circuits/add8c';
import { targetBRef } from '../circuits/targetB';
import { deployTapebook, tapeoutMiter } from './fixture';
import { describeCoverage, inputRanges, rng, sweepEval } from './util';
import { mintAndTapeout } from '../scripts/lib';

describe('seed circuits (PRD section 6)', function () {
  it('burn the stated NAND counts and report matching circuitInfo', async function () {
    const t = await loadFixture(deployTapebook);
    for (const s of SEEDS) {
      const b = s.build();
      expect(b.nand, `${s.key} builder NAND`).to.equal(s.expectedNand);
      expect(countBurn(decode(b.netlist, b.nIn)).nand).to.equal(s.expectedNand);
      const [nIn, nOut, nState, gateCount] = await t.circuits.read.circuitInfo([t.ids[s.key]]);
      expect([nIn, nOut, nState, gateCount], s.key).to.deep.equal([b.nIn, b.nOut, 0, s.expectedNand]);
      expect(await t.circuits.read.netlist([t.ids[s.key]])).to.equal(b.netlist);
    }
    // Every NAND minted for the seeds was burned at tape-out.
    expect(await t.transistors.read.balanceOf([t.me, 0n])).to.equal(0n);
  });

  for (const s of SEEDS) {
    it(`${s.key}: TapeOut eval matches its reference behaviour`, async function () {
      const t = await loadFixture(deployTapebook);
      const b = s.build();
      const { ranges, full } = inputRanges(b.nIn, s.key === 'TARGET_B' ? [383] : []);
      const outs = await sweepEval(t.circuits.address, t.ids[s.key], b.nIn, Math.ceil(b.nOut / 8), ranges);
      for (const [x, y] of outs) expect(y, `${s.key}(${x})`).to.equal(s.ref(x));
      console.log(`      ${s.key}: ${describeCoverage(b.nIn, outs.size, full)}`);
    });
  }

  it('Target B differs from ADD8C on exactly 32,768 inputs, lowest x = 383 (reference behaviour)', function () {
    let n = 0;
    let lowest = -1;
    for (let x = 0; x < 1 << 17; x++)
      if (targetBRef(x) !== add8cRef(x)) {
        n++;
        if (lowest < 0) lowest = x;
      }
    expect(n).to.equal(32768);
    expect(lowest).to.equal(383);
  });

  it('an interleaved output stage returns the wrong bits (170 for 0 + 0)', async function () {
    const t = await loadFixture(deployTapebook);
    const b = new NetlistBuilder(17);
    let carry = b.input(16);
    const sums: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = fullAdder9(b, b.input(i), b.input(8 + i), carry);
      sums.push(r.sum);
      carry = r.cout;
    }
    for (const x of [...sums, carry]) b.nand(b.nand(x, x), b.ONE); // inv, out, inv, out…
    const built = b.build(9);
    const { id } = await mintAndTapeout(t.circuits.address, t.transistors.address, t.me, built);
    const out = await t.circuits.read.eval([id, bytesToHex(packInt(0, 17))]);
    expect(out).to.equal(bytesToHex(packInt(170, 9)));
  });
});

describe('miter (PRD section 7)', function () {
  it('test 1: core/miter.ts is byte-identical to MiterLib.build on 50 random shapes', async function () {
    const h = await hre.viem.deployContract('MiterHarness');
    const r = rng(7);
    const shapes: { nIn: number; nOut: number }[] = [
      { nIn: 0, nOut: 1 },
      { nIn: 255, nOut: 255 },
      { nIn: 17, nOut: 9 },
    ];
    while (shapes.length < 50) shapes.push({ nIn: r.int(0, 255), nOut: r.int(1, 255) });
    for (const { nIn, nOut } of shapes) {
      const tapebook = getAddress(bytesToHex(Uint8Array.from(r.bytes(20))));
      const cpu = getAddress(bytesToHex(Uint8Array.from(r.bytes(20))));
      const id = BigInt(r.int(1, 2 ** 31)) * BigInt(r.int(1, 2 ** 31));
      const specId = BigInt(r.int(1, 1 << 20));
      const ts = buildMiter({ tapebook, cpu, id, specId, nIn, nOut });
      const sol = await h.read.build([tapebook, cpu, id, specId, BigInt(nIn), BigInt(nOut)]);
      expect(sol, `shape ${nIn}/${nOut}`).to.equal(ts.netlist);
      expect((ts.netlist.length - 2) / 2).to.equal(miterSize(nIn, nOut));
      expect(countBurn(decode(ts.netlist, nIn)).nand).to.equal(miterNand(nOut));
    }
    // Ids above u64 and pins above u8 are rejected by both.
    await expect(h.read.build([cpu0, cpu0, 2n ** 64n, 1n, 1n, 1n])).to.be.rejectedWith('IdOutOfRange');
    await expect(h.read.build([cpu0, cpu0, 1n, 1n, 256n, 1n])).to.be.rejectedWith('PinsOutOfRange');
    await expect(h.read.build([cpu0, cpu0, 1n, 1n, 1n, 0n])).to.be.rejectedWith('PinsOutOfRange');
    expect(() => buildMiter({ tapebook: cpu0, cpu: cpu0, id: 2n ** 64n, specId: 1, nIn: 1, nOut: 1 })).to.throw();
  });

  async function miterFixture() {
    const t = await deployTapebook();
    const before = await t.transistors.read.minted();
    const a = await tapeoutMiter(t, t.me, { cpu: t.circuits.address, id: t.ids.TARGET_A, nIn: 17, nOut: 9 }, t.ids.ADD8C);
    const minted = (await t.transistors.read.minted()) - before;
    const b = await tapeoutMiter(t, t.me, { cpu: t.circuits.address, id: t.ids.TARGET_B, nIn: 17, nOut: 9 }, t.ids.ADD8C);
    return { ...t, miterA: a.miterId, miterB: b.miterId, mintedForA: minted };
  }

  it('test 2: miter(A, ADD8C) has circuitInfo (17, 1, 0, 272) and burns 60 NAND', async function () {
    const t = await loadFixture(miterFixture);
    expect(await t.circuits.read.circuitInfo([t.miterA])).to.deep.equal([17, 1, 0, 272]);
    expect(t.mintedForA).to.equal(60n);
    expect(await t.transistors.read.balanceOf([t.me, 0n])).to.equal(0n);
    const nl = (await t.circuits.read.netlist([t.miterA])) as Hex;
    expect(countBurn(decode(nl, 17))).to.deep.equal({ nand: 60, latch: 0, refs: 2 });
    expect(keccak256(nl)).to.equal(
      keccak256(buildMiter({ tapebook: t.circuits.address, cpu: t.circuits.address, id: t.ids.TARGET_A, specId: t.ids.ADD8C, nIn: 17, nOut: 9 }).netlist),
    );
  });

  it('test 3: miter(A, ADD8C) returns 0 on every input', async function () {
    const t = await loadFixture(miterFixture);
    const { ranges, full } = inputRanges(17);
    const outs = await sweepEval(t.circuits.address, t.miterA, 17, 1, ranges);
    for (const [x, y] of outs) expect(y, `miter(A)(${x})`).to.equal(0);
    console.log(`      miter(A, ADD8C): ${describeCoverage(17, outs.size, full)}, all 0`);
  });

  it('test 4: miter(B, ADD8C) returns 1 exactly on the planted-fault inputs', async function () {
    const t = await loadFixture(miterFixture);
    const { ranges, full } = inputRanges(17, [383]);
    const outs = await sweepEval(t.circuits.address, t.miterB, 17, 1, ranges);
    let ones = 0;
    for (const [x, y] of outs) {
      const fault = targetBRef(x) !== add8cRef(x) ? 1 : 0;
      expect(y, `miter(B)(${x})`).to.equal(fault);
      ones += y;
    }
    expect(outs.get(383)).to.equal(1);
    if (full) expect(ones).to.equal(32768);
    console.log(`      miter(B, ADD8C): ${describeCoverage(17, outs.size, full)}, ${ones} ones`);
  });
});

const cpu0 = getAddress('0x0000000000000000000000000000000000000001');
