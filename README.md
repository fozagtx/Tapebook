# Tapebook

The bug bounty layer for TapeOut circuits on X Layer.

![Tapebook architecture](docs/architecture.png)

Processor: supply 1,000,000 transistors (the cap), 0.0001 OKB per transistor.

## Contracts

```bash
cd contracts && npm ci
export DEPLOYER_KEY=0x... OKLINK_API_KEY=...
npm run compile
npm run deploy:01 && npm run deploy:02 && npm run deploy:03
npx hardhat verify --network xlayer --constructor-args scripts/claims-args.ts <TapebookClaims address>
npm run deploy:04
npx hardhat test
```

## Frontend

Render → New → Blueprint → this repo. Set `NEXT_PUBLIC_CLAIMS_ADDRESS`, `NEXT_PUBLIC_TAPEBOOK_CIRCUITS` and `NEXT_PUBLIC_TAPEBOOK_TRANSISTORS` from `contracts/deployments/196.json`.
