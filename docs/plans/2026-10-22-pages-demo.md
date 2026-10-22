# GeoWild portfolio GitHub Pages release

## Authorization and scope

Standard Development. The owner explicitly authorized a separate public GitHub
Pages portfolio version using the current 17-species bank. This supersedes the
earlier owner-private audience for this new endpoint only. The original Sites
game and its 200-species expansion remain separate. Implementation, repository
creation, commit/push, Pages deployment and live-browser acceptance are covered.

Publish `jingkang0822/geowild-demo` at
`https://jingkang0822.github.io/geowild-demo/`. Five questions per round, 17
species, unlimited practice and daily challenge retain the existing game logic.
No extra feature, backend, API key, service, analytics, or original-site deployment.

## Implementation

1. Freeze the inspected `wildpin/dist/` snapshot, including locally packaged
   animal photos, country geometry, MapLibre and license notices. Record source
   hashes/provenance. The public repo is a release snapshot, not a second game
   implementation or an automatic mirror of the unfinished 200-species branch.
2. Copy that snapshot into `site/`. Change only the exported share URL and
   storage namespace (`geowild-demo:v1`), add portfolio/17-species labels and
   public metadata. Keep original game/controller/globe functionality intact.
   Never edit, stage, reset, or publish the original working checkout/history.
3. Reuse existing engine/geography/controller tests with public artifact paths;
   adapt the package verifier to this explicitly approved 17-species release.
   Keep the original 200-species release check unchanged. Add exact release
   hashes and a GitHub Pages workflow verifying them before publication.
4. Exercise real Chromium under the project subpath without starting a server.
   Check play, actual globe drag/zoom, confirmation, five-round results, daily
   isolation, reload, sharing, dialogs/Back, mobile, image/storage recovery.
   Repeat the same browser flows against live HTTPS and compare loaded bytes.

## Principle choices

- plan-before-code: b; this frozen plan precedes implementation; explicit owner
  execution/publication authorization requires no repeated approval.
- hard-right-over-easy: b; reuse the existing HTML/controller/engine/globe and
  asset owners. The separately hosted snapshot is the owner's requested delivery
  boundary, not an independently developed duplicate game.
- no-unauthorized-data-loss: b; original files and saves remain untouched;
  new-origin/new-namespace storage isolates demo progress. No resets/migrations.
- core-over-coverage: b; the approved 17-species job demo is the whole scope;
  do not wait for or finish the production 200-species expansion.
- mechanism-over-name: b; real MapLibre workers/WebGL, relative subpath assets,
  hash navigation and clipboard behavior are tested through the shipped entry.
- evidence-over-appearance: b; tests, live game flows and served-file hashes
  determine acceptance, not a plan, screenshot, or HTTP status alone.
- converge-knowledge: b; source provenance identifies the original snapshot;
  this plan owns public-demo scope and acceptance.

## Frozen contract

| Workflow | Production composition | Target runtimes | State ownership | Async identity/state machine | Topology semantics | Durable authority | Timing semantics | Mock compensation | Completion command | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public demo entry and navigation | Exported original HTML/controller, relative assets and hash history | Chromium desktop and 390px mobile emulation | Original app owns route/modal and focus | Home/play/results; dialog open/close/Escape/Back | Five sequential questions; no concurrent rounds | New demo localStorage namespace; no original-site read/write | Immediate navigation; reduced-motion globe movement | `scripts/browser.mjs`: entry-navigation; same exact bytes on live HTTPS | yarn verify | FROZEN |
| Guess and score | Original engine, real MapLibre and bundled country geometry/photos | Actual WebGL Chromium; desktop pointer and mobile alternative | Engine owns answers/score; app owns image identity; globe owns camera/draft | Image pending/ready/error with stale guard; guess once then reveal; optional explicit confirmation | Exactly five unique species and weighted score out of1000 | Persist before reveal in demo namespace; refresh resumes | No time-scored gameplay; finite camera transitions; no auto-spin | `scripts/browser.mjs`: game-loop; real camera drag and WebGL compensate controller substitutes | yarn verify | FROZEN |
| Daily/practice/results/share | Original seeded selector, results and clipboard fallback | Desktop/mobile HTTPS | Daily and practice separate; share uses actual saved score and demo URL | Five results -> complete -> share; clipboard success/error with selectable fallback | Practice unlimited; daily fixed by UTC; 17-species approved snapshot | Demo browser storage only; old site progress cannot transfer origins automatically | Copy only on user action; no unsolicited external send | `scripts/browser.mjs`: daily-practice-share; actual browser storage and fallback plus live page composition | yarn verify | FROZEN |
| Failure recovery | Original controller photo/map/storage recovery | Normal, blocked and corrupt browser storage and controlled failed photo request | Original raw corrupt bytes retained; session remains playable | Error -> exact retry; stale photo completion ignored | N/A: failure never creates an extra scored question | Existing demo raw bytes preserved; no delete-all control | Readiness gates guesses before scoring | `scripts/browser.mjs`: recovery; real browser fault injection plus normal live loading | yarn verify | FROZEN |
| Release delivery | Frozen site snapshot, hash manifest and Pages workflow | Project-path HTTPS | Git commit and release.json own published bytes | Verify -> push -> deploy -> served-byte/game acceptance | N/A: hosting does not execute the game server-side | Public artifact repo only; original private checkout unchanged | Bounded workflow and browser tests | `scripts/browser.mjs`: release-identity; actual HTML/JS/CSS/photo hashes on live URL | yarn verify | FROZEN |

## Acceptance

`yarn verify` runs adapted existing Node tests, exact 17-species package/license
checks, and real browser acceptance when the declared Playwright runtime is
installed. Browser acceptance may resolve the already installed local runtime;
CI installs its pinned test dependency. Reports/screenshots are ignored artifacts.
Release proof records local checks, final deployment run and actual live URL.
