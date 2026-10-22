# GeoWild — Portfolio Demo

[Play GeoWild](https://jingkang0822.github.io/geowild-demo/)

Five animal photos. One globe. Find a native country.

This independent job-portfolio release includes 17 sourced animal species, five
questions per round, unlimited practice and a daily UTC challenge. Drag or zoom
the globe, tap to answer, or turn on confirmation before locking in a guess.
Country borders approximate native-country regions; they are not precise habitat
maps. A five-round perfect score is 1,000 points.

## Independent demo

This repository hosts a frozen, inspected snapshot of GeoWild. The original
website and its expanded animal bank are developed separately. This release does
not connect to that site's services or update automatically from its working tree.

Photos, country geometry, MapLibre and game scripts are packaged in `site/`.
There is no account, backend, map API key or live tile request. WebGL is required.
Progress stays in this browser under `geowild-demo:v1`; old-site saves and progress
from other devices are separate. Copy score includes this demo's own URL.

## Verify and publish

Use Node 22+ and Yarn. Run `yarn install --frozen-lockfile`, then
`yarn playwright install chromium` to install the browser test runtime. On Linux,
use `yarn playwright install --with-deps chromium`. Run `yarn verify` for the domain,
geography, actual-controller, 17-species package, release hashes and real browser
checks. No frontend server starts; local browser tests intercept the exact static
files under the GitHub project path. `DEMO_URL` repeats the same flows on live HTTPS.
`DEMO_BROWSER_EXECUTABLE` can select an existing Chromium test binary.

After a deliberate snapshot update, run `node scripts/release.mjs`, inspect the
changes and run `yarn verify`. Commit only reviewed files. GitHub Actions repeats
verification before publishing `site/` through Pages. `site/release.json` identifies
all published files; `docs/source-snapshot.json` records source provenance and the
small public-demo overrides. Reports/screenshots are ignored in `artifacts/`.

## Credits

Animal photos retain their Creative Commons author, source and license links in
the game. [Animal evidence and credits](docs/animal-sources.md) and
[vendor sources](docs/vendor-sources.json) accompany the release. MapLibre GL JS is
BSD-3-Clause; Natural Earth country data is public domain. License notices remain
in `site/vendor/`. No GeoSports code or assets are included.

Scope and evidence: [release plan](docs/plans/2026-10-22-pages-demo.md).
