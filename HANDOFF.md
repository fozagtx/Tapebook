# Handoff: Tapebook — fix Render 502 on /api/index (memory), then polish

Repo: https://github.com/fozagtx/Tapebook.git  (local clone: /Users/kaizen/Desktop/tapebook/Tapebook)
Branch: `claude/lucid-ritchie-4v4k46` (the only branch; Render deploys it). HEAD pushed: `77fcb1e`.
Live site: https://tapebook-web.onrender.com (Render free tier, 512 MB, blueprint `render.yaml`, autoDeploy on).
Owner: fozagtx (ibrahimpima76@gmail.com). Git identity is already configured; NO Co-Authored-By trailers, ever.

## What Tapebook is (one paragraph)
Bug-bounty layer on TapeOut (X Layer, chain 196). Users buy "transistors" (NAND tokens) from the Tapebook processor,
tape out circuits, post bonded claims "circuit X == spec S", hunters break them with a counterexample. Repo = `contracts/`
(Hardhat) + `web/` (Next 16, React 19, viem 2, wagmi 2, ConnectKit). README has full deployment table.

## Mainnet deployment (DONE — do not redeploy)
Deployer `0x3080BA576b3eAC818696B805FF5B461a7cA386eD`; private key lives ONLY in the owner's macOS Keychain
(`security find-generic-password -a tapebook -s tapebook-deployer-key -w`). Never write it to a file or chat.
Processor 0x20CEC0Ca666B43e0CbCDBb50b0b6fdf6F2D7Dd13 · Transistors 0x3F35dc7C698bAE36F32ae83bABAEce7e3BF2D039 ·
TapebookClaims 0xF225AEc83B2738b791b3CD76006e248814bE55F0. All tx hashes: `contracts/deployments/196.json`.
Not verified on OKLink yet (owner has no OKLINK_API_KEY).

## Work completed this session (all pushed, see `git log`)
README rewrite, THIRD_PARTY_NOTICES folded into README license line, addresses baked into `web/lib/config.ts` MAINNET
+ `render.yaml`, both API routes `force-dynamic`, factory deployBlock 70995047 default, history log scan skipped on
public RPCs (they cap eth_getLogs at 100 blocks; only runs when XLAYER_RPC_URL set), ConnectKit replaces custom wallet
dropdown (wagmi 3→2, `web/.npmrc` legacy-peer-deps; ConnectKit drops all customTheme keys if --ck-accent-color is
present, so theme uses derived vars with literal hex), RequireWallet gate removed (reads need no wallet, WriteGate at
write time), Docs nav link removed, NAND-gate favicon `web/app/icon.svg`, in-process stale-while-revalidate cache for
/api/index + /api/versions warmed at boot via `web/instrumentation.ts` (caches on globalThis — instrumentation and
route bundles don't share module instances under `next start`).

## IN PROGRESS — the current 502 (uncommitted working tree: render.yaml, web/lib/config.ts, web/lib/indexer.ts)
Root cause measured: `buildIndex()` in `web/lib/indexer.ts` crawls 309 processors / 12,978 circuits and fetched ALL
netlist bytes in one `rd()` call → peak RSS 495 MB in a bare Node process → Render OOM-kills the server mid-build →
502 on /api/index, and /api/versions also 502s during the restart. Verified live: `curl https://tapebook-web.onrender.com/api/index`
→ 502 `x-render-routing: dynamic-paid-error` after ~11-24 s.

Fix already written in the working tree (review it with `git diff`):
- `lib/indexer.ts`: netlist phase now loops over `ids` in slices of `INDEX.netlistChunk`, reads each slice with
  `readMany(..., { batch: INDEX.netlistBatch, concurrency: INDEX.netlistConcurrency })`, folds to hash/size/miterOf,
  drops the strings, optional `gc?.()`. Output shape unchanged. Debug `rss()` probes were removed.
- `lib/config.ts` INDEX: `netlistBatch: 25`, `netlistChunk: 400`, `netlistConcurrency: 1` (new keys, doc comments).
- `render.yaml`: `NODE_OPTIONS=--max-old-space-size=384`.

Remaining steps:
1. Measure: `cd web && NODE_OPTIONS=--max-old-space-size=384 npx tsx --tsconfig tsconfig.json /tmp/mem.mts`
   (script may be gone after reboot; it imports buildIndex/serverClient/FACTORIES/TAPEBOOK, samples process.memoryUsage().rss
   every 100 ms, prints time/peak RSS/heap/json size/processors/circuits). Baseline 17.4 s / 495 MB. Target < 250 MB.
   If still high, lower netlistChunk to 200. Expect it to be slower than 17 s now (concurrency 1) — acceptable
   because the cache + boot warm-up hides it, but if > 60 s consider netlistConcurrency 2.
2. `cd web && npm run lint && npm run typecheck && npm run build` — all must pass (they did before this edit).
3. Commit (message: why — OOM on 512 MB Render), push `origin HEAD`. Render auto-deploys; then verify
   `curl -sD - -o /dev/null https://tapebook-web.onrender.com/api/index` → 200 with `x-snapshot-age` header (may need
   ~60 s after deploy for the boot warm-up; first hit during warm-up blocks on compute).
4. Also tell the owner: Render free tier spins down after 15 min idle → first visitor pays boot + index time; Starter
   plan removes that. An Alchemy X Layer RPC in `XLAYER_RPC_URL` (Render env tab) enables the upgrade-history scan and
   better rate limits — code already supports it. Owner must add the key himself; never paste secrets.

## Open UX question the owner raised (unanswered)
He asked why the hero still says "Open the Book" when the wallet is connected. Current behaviour is intentional
(it's a nav link; wallet state shows in the navbar as the short address → /account). Options offered: add "My account"
next to it when connected / replace it when connected / leave as is. Awaiting his answer.

## Owner context
Very price- and time-sensitive, frustrated by long waits and by sidekick/subagent handoffs being interrupted — prefer
doing small focused edits directly and reporting fast. Typos heavy; read intent. Explain blockchain costs plainly.
Local dev server may still be on :3000 (`lsof -ti :3000 | xargs kill` to clear).

## Suggested skills for next session
none required; `diagnose` if the memory fix doesn't hold.
