import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { bytesToHex, hexToBytes, packInt, unpackInt } from '../core/bits';
import { DEMO_HIT, DEMO_MISSES, demoInput } from '../core/demo';
import { deployTapebook } from './fixture';

// The landing page animation must show what TapeOut computes, not what we think it computes.
describe('landing demo vectors (core/demo.ts)', function () {
  it('match TapeOut eval of Target B and ADD8C', async function () {
    const t = await loadFixture(deployTapebook);
    for (const v of [...DEMO_MISSES, DEMO_HIT]) {
      const x = bytesToHex(packInt(demoInput(v), 17));
      const target = unpackInt(hexToBytes(await t.circuits.read.eval([t.ids.TARGET_B, x])), 9);
      const spec = unpackInt(hexToBytes(await t.circuits.read.eval([t.ids.ADD8C, x])), 9);
      expect([Number(target), Number(spec)], `x = ${x}`).to.deep.equal([v.target, v.spec]);
    }
    for (const v of DEMO_MISSES) expect(v.target).to.equal(v.spec);
    expect(DEMO_HIT.target).to.not.equal(DEMO_HIT.spec);
  });
});
