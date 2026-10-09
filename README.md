# Tapebook

**The bug bounty layer for TapeOut circuits on X Layer.**

Owners stake OKB that a circuit matches its spec. Anyone who finds one input where they disagree takes the stake. Every check is TapeOut's own on-chain `eval`.

![Tapebook architecture](docs/architecture.png)

## How it works

1. **Stake:** the owner tapes out a miter (target vs spec → 1 bit) and calls `post` with a bond (≤ 1 OKB, locked ≥ 1 day).
2. **Hunt:** anyone searches with `differs(claimId, x)`.
3. **Break:** `commit` the input's hash, wait one block, `challenge`. If the miter returns 1 the claim is BROKEN.
4. **Get paid:** the bond is credited to the hunter, who calls `withdraw`.

## Repository

```
contracts/   TapebookClaims.sol, MiterLib.sol, vendored TapeOut source, seed circuits, tests, deploy scripts
web/         Next.js app
render.yaml  Render deploy for web/
```

Processor parameters: supply 1,000,000 transistors (the cap), 0.0001 OKB per transistor.

## Deploy the contracts (X Layer mainnet)

Not deployed yet. Needs Node 22, a deployer key with OKB, and an OKLink API key.

```bash
cd contracts && npm ci
export DEPLOYER_KEY=0x... OKLINK_API_KEY=...
npm run compile
npm run deploy:01   # create the Tapebook processor
npm run deploy:02   # tape out the specs and reference targets
npm run deploy:03   # deploy TapebookClaims, register specs
npx hardhat verify --network xlayer --constructor-args scripts/claims-args.ts <TapebookClaims address>
npm run deploy:04   # miters + the two seed claims
```

Addresses are written to `contracts/deployments/196.json`. Re-running skips completed steps.

## Deploy the frontend (Render)

Render → **New → Blueprint** → this repo. Set these from `contracts/deployments/196.json`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLAIMS_ADDRESS` | `claims.address` |
| `NEXT_PUBLIC_TAPEBOOK_CIRCUITS` | `tapebook.circuits` |
| `NEXT_PUBLIC_TAPEBOOK_TRANSISTORS` | `tapebook.transistors` |
| `NEXT_PUBLIC_WC_PROJECT_ID` | optional, WalletConnect |
| `XLAYER_RPC_URL` | optional, server RPC |

## Tests

```bash
cd contracts && npx hardhat test
```

32 passing. Exhaustive runs over all 2^17 inputs confirm the seed circuits and miters. `challenge` at the 1,000-gate limit costs 2,528,818 gas.

## Security

- Unaudited. Bonds are capped at 1 OKB per claim.
- `TapebookClaims` has no owner, no fee and cannot be upgraded.
- TapeOut is upgradeable until sealed. If its logic changes, claimants may take their bond back early.
