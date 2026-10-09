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

## Render 502 on /api/index (memory) — fix committed, NOT yet measured live
Root cause: `buildIndex()` read all 12,978 netlists in one `rd()` call → peak RSS 495 MB → Render OOM-kill → 502.
Fix (`lib/indexer.ts`, `lib/config.ts` INDEX): netlists read in chunks of `netlistChunk` (400), `netlistBatch` 25 per
multicall, `netlistConcurrency` 2; each chunk is reduced to hash/size/miterOf and dropped. Output shape unchanged.
Heap cap `--max-old-space-size=384` is set in render.yaml **startCommand only** — as an env var it also applied to
`next build`, which OOMs at 384 MB (reproduced). If a NODE_OPTIONS var exists in Render's Environment tab, delete it.
lint / typecheck / build pass; `next start` boots under the cap.

Still to do:
1. Measure peak RSS + time against mainnet (target < 250 MB; if higher, lower netlistChunk to 200). The cloud session
   could not reach the X Layer RPCs (network policy), so this needs a machine with RPC access or the live deploy.
2. Get these commits onto the branch Render deploys, then verify
   `curl -sD - -o /dev/null https://tapebook-web.onrender.com/api/index` → 200 with `x-snapshot-age`.
3. Tell the owner: free tier spins down after 15 min idle (Starter removes it); an Alchemy X Layer RPC in
   `XLAYER_RPC_URL` enables the upgrade-history scan and better rate limits. Owner adds keys himself.

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
