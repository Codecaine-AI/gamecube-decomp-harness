# Melee PR Series — State and Runbook

**Last updated:** 2026-07-15 (session run `53d5b342-c066-48fc-aa49-dd78b69dc2ac`, session branch `orchestrator/session/61d22348-876b-403a-bb9a-3154f7156fde`, source commit `c69143fcea`)

The July 2026 melee session was split into **11 subsystem PRs** (12 planned; `ft-yoshi` dissolved — upstream independently matched its only file, leaving an empty diff). All content went through the `pr-session-review` pipeline (harness commit `f18f92a6`): standards review → skeptic confirm → enforced repair (matched code preserved byte-exact) → tiered findings ledger.

**Only the first four PRs are open, deliberately.** They are the test bed for the review workflow, and opening all eleven at once would overwhelm the doldecomp reviewers. Do **not** open more PRs without Ford's explicit go, and when he gives it, open them in small batches he sizes.

## Current state

### Open (test bed)

| PR | Slice | CI | Comments |
|---|---|---|---|
| [#2849](https://github.com/doldecomp/melee/pull/2849) | cm-mp | green | precise, grouped, match-context |
| [#2850](https://github.com/doldecomp/melee/pull/2850) | ft-chara-ft-common | green | same |
| [#2851](https://github.com/doldecomp/melee/pull/2851) | mn | green | same |
| [#2852](https://github.com/doldecomp/melee/pull/2852) | sysdolphin | green | same; slice trimmed to 13 files (shared-header hunks deferred to owning slices) |

Titles say "N/12" — renumber to N/11 at the next natural touch point.

### Prepared, NOT opened (branches on `fjooord/melee` fork)

All seven: session content applied, rebased onto master `d232a185` (upstream-wins conflict policy), overlap files MWCC compile-verified, pushed.

| Branch | Files | Notes |
|---|---|---|
| `decomp/ft-chara-ft-kirby` | 5 | PR #2853 was briefly opened then closed — `gh pr reopen 2853` reuses it |
| `decomp/ft-root` | 10 | PR #2854 same — `gh pr reopen 2854` |
| `decomp/gm` | 34 | ⚠ ships `gm/types.h` (header coupling); conflict-merged: `gm_1601.c` `gm_16AE.c` `gm_1832.c` `gm_1A33.c` `gmcamera.c` `gmtou_1.c` |
| `decomp/gr` | 29 | ⚠ ships `grvenom.h`; merged: `grkongo.c` `grvenom.c` |
| `decomp/lb` | 15 | ⚠ ships `lbsnap.h`; merged: `lbshadow.c` `lbsnap.c` |
| `decomp/ty` | 6 | ⚠ ships `toy.h`; merged: `toy.c` `tyfigupon.c`; `tylist.c` adapted session symbol renames to master names |
| `decomp/it` | 5 | merged: `itlinkhookshot.c` `itsamusgrapple.c` |

⚠ = **header-coupling risk**: shipping a shared header without its dependent `.c` fixes broke #2852's CI (master's `lbsnap.c` failed to compile against sysdolphin's header changes). For these slices, run the isolation check (prepare-local) and compile master-side includers of each shipped header before opening.

- Findings for all seven are already generated in the ledger:
  `projects/melee/state/pr_session_review/53d5b342-c066-48fc-aa49-dd78b69dc2ac/ledger.json`
- Conflict-merged files have **line drift** vs the ledger (which references `c69143fcea`); the SHA anchor guard handles this by posting file-referenced instead of misanchored inline comments.

## How to open a prepared PR (agent runbook)

Prereqs: orchestrator dashboard server on `localhost:8787`; project = `melee`; state dir `projects/melee/state`; fork remote `fork` = `fjooord/melee`; upstream = `doldecomp/melee`.

1. **Freshness check.** `git fetch origin`; diff `d232a185..origin/master -- src/` against the slice's files. Overlap → re-rebase that slice first (isolated worktree from `origin/master`, non-overlap files via `git checkout c69143fcea -- <file>`, overlap files via `git diff 25c6c15f7a..c69143fcea -- <file> | git apply --3way`, resolution policy: upstream's new matches always win; MWCC-compile every merged file; push `-f` to `fork`).
2. **Ledger v2 (once, recommended).** Findings-only sweep regenerates the ledger with precomputed tier + match-context: `make pr-session-review REPO_ROOT=<session worktree> STATE_DIR=projects/melee/state RUN_ID=53d5b342-... RUN_ARGS='--run-agents --skip-repair --concurrency 12 --checkpoint none --candidate-list <slice files>'`. Without it, comments still post correctly tiered/grouped but lack the match-context line.
3. **Refresh ship stamps.** `make verify-ship-set` (or `POST /api/pr/verify-ship-set`) — fail-closed; writes consistent `ship_status.json` + `baseline_status.json` for current master. Never hand-edit those stamps.
4. **Prepare + open through the pipeline** (this is what applies the comment policy automatically):
   `POST /api/prs/prepare-local {"projectId":"melee","runId":"53d5b342-...","prBranch":"decomp/<slice>"}` (runs per-slice isolation verification — do not skip for ⚠ slices), then
   `POST /api/prs/open {"projectId":"melee","runId":"53d5b342-...","prBranch":"decomp/<slice>","ledgerPath":"<state>/pr_session_review/<run>/ledger.json","postLedgerComments":true}`.
   For #2853/#2854 prefer `gh pr reopen` then post comments via the same ledger path.
5. **Pace GitHub.** ≥60–90s between PR creations (secondary rate limits); comment posting is verified-with-backoff in the pipeline.
6. **Post-open.** Confirm CI; title as `Melee decomp N/11: <name>`; drafts stay drafts; comments must come out tier-1-only, grouped per (file, rule), with dedup markers (`decomp-orchestrator:pr-draft-qa:<hash>`); ongoing rounds go through `make pr-draft-qa PR=<n>`.

### Comment policy (Ford's rulings, baked into pipeline + reviewer prompt)

Inline comments only for clear-cut violations: deterministic `review_lint` errors + the nine precise standards (literals/data ownership, string-literal regression, canonical control flow/macros, assert macros, header inlines, pragma/asm ban, define-alias ban, data-section/TU splits, text-before-data). `matching-tactics-need-evidence` is retired (too vague). `truthful-headers` is CI-owned. Style standards (`infer-authored-source-style`, `typed-fields`, `conservative-naming`, `natural-loops`) never post. `left_with_evidence` items go in one collapsed summary; warnings/refuted never post. Every comment carries match context: exact match (keep-leaning) vs improvement-lane (change-tolerant), plus repair-revert evidence when an automated fix already proved breakage.
