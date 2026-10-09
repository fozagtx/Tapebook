# Tapebook

**The bug bounty layer for TapeOut circuits on X Layer.**

A circuit's owner stakes OKB on "my circuit behaves exactly like this spec on every input". Anyone who finds one input where the two disagree breaks the claim and takes the stake. Every check is TapeOut's own on-chain `eval`; there is no off-chain simulator, oracle or judge.

> A circuit cannot be proven correct on-chain, but it can be proven wrong with one input.

![Tapebook architecture](docs/architecture.png)

## How it works

1. **Stake.** The owner picks a spec and tapes out a *miter* on the Tapebook processor: a circuit that references the target and the spec, XORs every output pin and ORs the results into one bit. Then `post` locks a bond (at most 1 OKB, locked at least one day).
2. **Hunt.** Anyone searches for an input where the miter returns 1, using `differs(claimId, x)` (a view call to TapeOut's `eval`).
3. **Break.** The hunter `commit`s `keccak256(claimId, x, address)`, waits one block, then `challenge`s with `x`. If TapeOut's `eval` of the miter returns 1, the claim is BROKEN.
4. **Get paid.** The bond is credited to the hunter, who `withdraw`s it.

Claims only ever read **OPEN**, **BROKEN** or **UNCLAIMED**, never "verified" or "safe".

## Repository

```
contracts/     Hardhat 2 package
  contracts/   TapebookClaims.sol, MiterLib.sol, vendored TapeOut source (contracts/tapeout, MIT)
  core/        netlist + miter encoding in TypeScript, shared with web/ (byte-identical to MiterLib)
  circuits/    the six seed circuits (ADD8C, MAJ5, EQ8, MUX8, Target A, Target B)
  scripts/     deploy scripts 01–04, local helpers, ABI export
  test/        tests 1–13, invariant, upgrade and demo tests
  abi/         generated ABIs, imported by web/
web/           Next.js 16 app (viem, wagmi), deployed on Render
docs/          architecture diagram (SVG source + PNG)
render.yaml    Render Blueprint for web/
```

There are two packages because Hardhat 2 compiles TypeScript as CommonJS while Next.js uses bundler resolution; one `tsconfig.json` cannot serve both.

## What is deployed on X Layer

| Item | How | Ours? |
|---|---|---|
| Tapebook processor | one `createCPU` on TapeOut's factory `0x1f09daefa827f02cbb40967cc91b259763760761` | No, TapeOut's contracts |
| Specs, reference targets, miters | `mint` + `tapeout` on that processor | No, data on TapeOut's contracts |
| `TapebookClaims` (with `MiterLib`) | Hardhat deploy, source-verified on OKLink | **Yes, the only contract we deploy** |
| Website | Render | Not a contract |

**Status: not deployed yet.** Addresses are written to `contracts/deployments/196.json` when the scripts below run.

Processor parameters, also written into the on-chain `story` string at creation: **supply 1,000,000 transistors, which is the cap (no other cap); price 0.0001 OKB per transistor.** Tapebook launches no token and has no trading component.

## Deploy the contracts to X Layer mainnet

Needs Node 22, a deployer key holding OKB, and a free OKLink API key (oklink.com → My account → API management).

```bash
cd contracts
npm ci
export DEPLOYER_KEY=0x...      # never committed, never used by the website
export OKLINK_API_KEY=...
npm run compile                # compiles and writes abi/index.ts

npm run deploy:01   # createCPU("Tapebook", "TBOOK", story, 1000000, 0.0001 OKB), value = deployFee() read live
npm run deploy:02   # mint NAND + tape out ADD8C, MAJ5, EQ8, MUX8, Target A, Target B
npm run deploy:03   # deploy TapebookClaims with conformance vectors, register the four specs, check conformance()
# wait at least one minute, then verify on OKLink:
npx hardhat verify --network xlayer --constructor-args scripts/claims-args.ts <TapebookClaims address>
npm run deploy:04   # tape out the miters for Target A and B, post both seed claims
```

Every script reads fees from the chain, records addresses and transaction hashes in `deployments/196.json`, and skips steps already recorded, so it is safe to re-run. The claim on Target A is meant to stay OPEN; the claim on Target B (which has one planted fault) is meant to be broken through the Hunt page.

## Deploy the website on Render

1. In Render: **New → Blueprint**, pick this repository. Render reads `render.yaml`.
2. Fill in the environment variables it asks for, from `contracts/deployments/196.json`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLAIMS_ADDRESS` | `claims.address` |
| `NEXT_PUBLIC_TAPEBOOK_CIRCUITS` | `tapebook.circuits` (the processor's identity) |
| `NEXT_PUBLIC_TAPEBOOK_TRANSISTORS` | `tapebook.transistors` |
| `NEXT_PUBLIC_WC_PROJECT_ID` | optional, WalletConnect project id for mobile wallets |
| `NEXT_PUBLIC_TAPEOUT_DEPLOY_BLOCK` | optional, bounds the upgrade-history log scan |
| `XLAYER_RPC_URL` | optional, server-side RPC (defaults to the public X Layer RPCs) |

`NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them. The service builds from the repository root (`cd web && npm ci && npm run build`) because the site imports `contracts/core` and `contracts/abi`.

## The website

- **Landing page:** public, read-only, no wallet actions.
- **App pages** (Book, Circuit, Claim, Hunt, Specs, Account) open only after a wallet connects on X Layer. Every transaction shows its function, value and contract before signing, then awaiting signature → pending → confirmed / failed with the decoded revert reason. Multi-step flows (mint → tape out → post, commit → challenge) resume after a reload by re-reading the chain.
- **`/api/index`:** the Book, a snapshot of every TapeOut processor and circuit read through Multicall3 at one block, rebuilt at most every 10 minutes.
- **`/api/versions`:** which TapeOut logic is in force, the seal flag, fees, Tapebook's conformance check and the upgrade history from event logs, rebuilt at most every 10 minutes.
- **Hunt:** Multicall3 batches of 256 `differs` calls at one pinned block, at most 20 batches per second, halved on an RPC error. Inputs of up to 16 pins are swept exhaustively.
- Unreadable values render as "—"; nothing is estimated or invented.

## Tests

```bash
cd contracts
npx hardhat test                                    # in-process Hardhat network, sampled sweeps
EXHAUSTIVE=1 npx hardhat test --network localhost   # all 2^17 inputs; run a local node first
```

All contract tests run against the vendored TapeOut source (real factory behind an ERC-1967 proxy, real VM). Last run: **32 passing**.

- Tests 1–13 from the PRD: miter byte-identity (TypeScript vs Solidity, 50 random shapes), miter shape and burn (60 NAND, 272 gates), all `post` and `challenge` reverts, commit–reveal rules, non-canonical inputs, bond lock and reclaim, reentrancy, and gas.
- Exhaustive run: ADD8C and Target A match `a + b + cin` on all 131,072 inputs; MAJ5, EQ8 and MUX8 match on all of theirs. Target B differs from ADD8C on exactly 32,768 inputs, the lowest being 127 + 1. The miter returns 0 everywhere for Target A and 1 exactly on the faulty inputs for Target B.
- Invariant: the contract's balance equals open bonds plus unpaid credits after every step of 500 seeded-random action sequences (5,000 checked steps).
- Upgrades: a TapeOut logic change enables early `reclaimBond`; `conformance()` passes on the vendored source and fails against a deliberately altered VM; `seal()` freezes upgrades.
- **Gas: `challenge` at the gate limit (miter of 1,000 gates) costs 2,528,818 gas.**
- The landing-page animation's inputs and outputs (`contracts/core/demo.ts`) are checked against TapeOut's `eval`.

The website's indexer tests (PRD 14–15) are not written yet.

### Run everything locally

```bash
# terminal 1: a local node (anvil is much faster for eval sweeps; npx hardhat node also works)
anvil --hardfork cancun --gas-limit 1000000000 --block-time 1
# terminal 2
cd contracts && npm run local:deploy        # vendored TapeOut + Multicall3, then scripts 01–04
cd ../web && npm ci && npm run local:env && npm run dev
```

## Security and limits

- **Unaudited.** Bonds are capped at 1 OKB per claim. Not financial advice.
- `TapebookClaims` has no owner, no admin and no fee, and cannot be upgraded. It uses pull payments, checks-effects-interactions and OpenZeppelin `ReentrancyGuard`.
- **TapeOut itself is upgradeable until its owner calls `seal()`.** Every claim records the circuit logic it was posted under. If that logic changes, the claimant may take the bond back before the lock ends; the claim stays open and breakable. `conformance()` re-checks the seed specs on fixed vectors so a VM change is visible.
- A claim is only as meaningful as its spec. The UI always shows the spec's name, owner and source, and marks Tapebook's four seed specs separately from third-party specs.

## Credits and licenses

- TapeOut contract source (`contracts/contracts/tapeout/`), MIT, mirrored at [davieslennox0/nandout](https://github.com/davieslennox0/nandout).
- UI components from [Vengeance UI](https://github.com/Ashutoshx7/VengeanceUI) (MIT) and [BoldKit](https://github.com/ANIBIT14/boldkit) (`ascii-shapes`, `motion-core`; MIT).
- Multicall3 (MIT), used by local tests only; on X Layer the canonical deployment is used.
