import hre from 'hardhat';
import { expect } from 'chai';
import { loadFixture, mine, time } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { encodeAbiParameters, keccak256, parseEther, type Address, type Hex } from 'viem';
import { bytesToHex, packInt } from '../core/bits';
import { seed } from '../circuits';
import { mintAndTapeout } from '../scripts/lib';
import { deployClaimsWithMiters, tapeoutMiter } from './fixture';
import { rng, tx } from './util';

// Test 12: contract balance == open bonds + unpaid credits after every step of
// 500 seeded-random action sequences (post, topUp, commit, challenge, reclaim, withdraw).

const SEQUENCES = Number(process.env.INVARIANT_SEQUENCES ?? 500);
const STEPS = Number(process.env.INVARIANT_STEPS ?? 10);
const DAY = 86_400n;

function commitment(claimId: bigint, x: Hex, sender: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }], [claimId, x, sender]));
}

async function world() {
  const t = await deployClaimsWithMiters();
  const wallets = await hre.viem.getWalletClients();
  const P = t.circuits.address;
  const second = wallets[4].account.address; // also owns targets
  // Copies of Target A and B owned by a second claimant, each with its miter.
  const a2 = await mintAndTapeout(P, t.transistors.address, second, seed('TARGET_A').build());
  const b2 = await mintAndTapeout(P, t.transistors.address, second, seed('TARGET_B').build());
  const m = (id: bigint, owner: Address) => tapeoutMiter(t, owner, { cpu: P, id, nIn: 17, nOut: 9 }, t.ids.ADD8C);
  const targets = [
    { id: t.ids.TARGET_A, miter: t.miterA, owner: t.me },
    { id: t.ids.TARGET_B, miter: t.miterB, owner: t.me },
    { id: a2.id, miter: (await m(a2.id, second)).miterId, owner: second },
    { id: b2.id, miter: (await m(b2.id, second)).miterId, owner: second },
  ];
  const hunters = [wallets[3].account.address, wallets[5].account.address];
  const accounts = [t.me, second, ...hunters];
  return { ...t, targets, hunters, accounts };
}

describe('invariant (test 12)', function () {
  it(`balance == open bonds + unpaid credits over ${SEQUENCES} random sequences`, async function () {
    const pc = await hre.viem.getPublicClient();
    let steps = 0;
    const counts: Record<string, number> = {};
    for (let seq = 0; seq < SEQUENCES; seq++) {
      const w = await loadFixture(world);
      const r = rng(1000 + seq);
      const committed: { claimId: bigint; x: Hex; who: Address }[] = [];

      const check = async (what: string) => {
        const n = await w.claims.read.claimCount();
        let bonds = 0n;
        for (let i = 1n; i <= n; i++) {
          const c = await w.claims.read.getClaim([i]);
          if (c.status === 1) bonds += c.bond;
          else expect(c.bond).to.equal(0n);
        }
        let credits = 0n;
        for (const a of w.accounts) credits += await w.claims.read.credit([a]);
        const bal = await pc.getBalance({ address: w.claims.address });
        expect(bal, `seq ${seq} after ${what}`).to.equal(bonds + credits);
        steps++;
      };

      for (let s = 0; s < STEPS; s++) {
        const n = await w.claims.read.claimCount();
        const action =
          n === 0n ? 'post' : r.pick(['post', 'topUp', 'commit', 'commit', 'challenge', 'challenge', 'reclaim', 'withdraw', 'withdraw', 'wait']);
        let ok = true;
        try {
          if (action === 'post') {
            const tg = r.pick(w.targets);
            const bond = r.pick([0n, 1n, parseEther('0.01'), parseEther('0.5'), parseEther('1'), parseEther('1') + 1n]);
            const lock = r.pick([0n, DAY - 1n, DAY, 3n * DAY]);
            await tx(w.claims.write.post([w.circuits.address, tg.id, w.ids.ADD8C, tg.miter, lock], { value: bond, account: tg.owner }));
          } else if (action === 'topUp' && n > 0n) {
            const id = BigInt(r.int(1, Number(n)));
            const c = await w.claims.read.getClaim([id]);
            const v = r.pick([1n, parseEther('0.2'), parseEther('0.9')]);
            await tx(w.claims.write.topUp([id], { value: v, account: c.claimant }));
          } else if (action === 'commit' && n > 0n) {
            const id = BigInt(r.int(1, Number(n)));
            const x = r.bool(0.7) ? bytesToHex(packInt(383, 17)) : bytesToHex(packInt(r.int(0, (1 << 17) - 1), 17));
            const who = r.pick(w.hunters);
            await tx(w.claims.write.commit([commitment(id, x, who)], { account: who }));
            committed.push({ claimId: id, x, who });
            await mine(1);
          } else if (action === 'challenge' && committed.length > 0) {
            const c = r.pick(committed);
            await tx(w.claims.write.challenge([c.claimId, c.x], { account: c.who }));
          } else if (action === 'reclaim' && n > 0n) {
            const bonded: bigint[] = [];
            for (let i = 1n; i <= n; i++) if ((await w.claims.read.getClaim([i])).bond > 0n) bonded.push(i);
            const id = bonded.length && r.bool(0.8) ? r.pick(bonded) : BigInt(r.int(1, Number(n)));
            const c = await w.claims.read.getClaim([id]);
            await tx(w.claims.write.reclaimBond([id], { account: c.claimant }));
          } else if (action === 'withdraw') {
            const owed: Address[] = [];
            for (const a of w.accounts) if ((await w.claims.read.credit([a])) > 0n) owed.push(a);
            await tx(w.claims.write.withdraw({ account: owed.length && r.bool(0.8) ? r.pick(owed) : r.pick(w.accounts) }));
          } else if (action === 'wait') {
            await time.increase(BigInt(r.int(0, 4 * 86_400)));
          } else {
            ok = false;
          }
        } catch {
          ok = false; // reverted actions must leave the invariant intact as well
        }
        const key = `${action}:${ok ? 'ok' : 'reverted'}`;
        counts[key] = (counts[key] ?? 0) + 1;
        await check(action);
      }
    }
    console.log(`      ${steps} checked steps; actions: ${JSON.stringify(counts)}`);
    expect(counts['challenge:ok'] ?? 0).to.be.greaterThan(0);
    expect(counts['withdraw:ok'] ?? 0).to.be.greaterThan(0);
    if (SEQUENCES >= 100) expect(counts['reclaim:ok'] ?? 0).to.be.greaterThan(0);
  });
});
