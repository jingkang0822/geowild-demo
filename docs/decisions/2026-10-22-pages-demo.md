---
issue: none
repo: geowild-demo
plan: docs/plans/2026-10-22-pages-demo.md
review: none
commits: 1523dd635df220c60e1af7aca3c1363d569006df
graph_version: ccf14a002e5dfea12a7863dd54f48cd7c22a68ef
---

# Decisions — separate GeoWild portfolio release

## Decisions

| # | Node ID | Chose | Decided by | Basis | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | principle.plan-before-code | b | auto | Standard release plan frozen before edits; owner explicitly authorized separate public 17-species demo and publication | correct |
| 2 | principle.core-over-coverage | b | human | Owner accepted 17 species for job demo; production expansion is outside this release | correct |
| 3 | principle.hard-right-over-easy | b | auto | Reused existing engine/controller/globe and frozen assets; no independently implemented game path | correct |
| 4 | principle.no-unauthorized-data-loss | b | auto | Separate repo/origin/namespace; original export still matches source hashes; no resets or migrations | correct |
| 5 | principle.mechanism-over-name | b | auto | Actual project-path HTTPS, browser WebGL, touch/pointer, storage and loaded-byte checks | correct |
| 6 | principle.evidence-over-appearance | b | auto | Local, CI and live verification passed;31 served files match manifest; nine browser flows completed | correct |
| 7 | principle.converge-knowledge | b | auto | Frozen snapshot provenance and source hashes retain source identity; scope and limits owned by release plan/acceptance | correct |

## Uncovered scenarios

| # | Principle | Situation | Tension matched | Chose | Outcome |
| --- | --- | --- | --- | --- | --- |

## Human intervention points

| # | Node ID | Why it stopped | What the human decided |
| --- | --- | --- | --- |
| 1 | principle.core-over-coverage | Earlier feasibility work had not authorized this separate public release | New authority: publish current 17-species job demo, independently of the production website |

## Retrospective

Development, Standard. The independent static release is live and verified. Rework: a browser-test assumption skipped one nested menu history level; the test now checks the existing route semantics. An additional content-hash probe attempted the build-only dotfile URL; its 404 is now documented separately from 31 served content files. No game behavior changed to satisfy either test. Initial namespace/shareURL Red tests failed against the old constants, then passed with the demo constants.

Elapsed duration, input/cache/output tokens and cost: unknown. Existing recorded gpt-6.1-sol by_model duration/token/cost aggregates are null; no route comparison is inferred. One required UI worker changed only portfolio metadata/captions; no extra review rounds or implementation workers. No material reusable workflow change is justified by this run. Recommendation: none.
