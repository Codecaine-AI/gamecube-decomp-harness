# Task B: Knowledge V2 — make prior-run knowledge reachable by workers

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Work only under `apps/server/src/core/knowledge-v2/` and its tests, plus `apps/server/src/core/tools/wrappers/knowledge-v2*.ts` if a tool schema needs a new field. Do NOT touch files that already have uncommitted changes (`git status` — the librarian/apply/backfill/drift files are someone else's in-flight work; leave them alone). Do NOT rebuild or modify anything under `games/melee/` (live state). Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

## Why
An audit of 1,627 worker runs found the winning move was recovering the previous run's diagnosis on the same target. The summarizer already stores that in `run_narrative` (summary + `notable_observations` with `reusable_when`), but no worker-facing surface returns it, and the attempt text index is empty.

## Bug 1 — empty attempt FTS
`apps/server/src/core/knowledge-v2/index/fts.ts` `buildAttemptFts` indexes only `submission WHERE hypothesis IS NOT NULL`. Every submission has a null hypothesis (14,791 of 14,791 in the live store), so `attempt_fts` holds 5,378 rows with empty text and every `kv2_attempt_search({query})` returns nothing.

Fix: index per run the concatenation of (a) every submission's `description` (and `hypothesis` when present), (b) `run_narrative.summary`, (c) each `notable_observations[].observation` + `reusable_when`. Keep the locator format. Update `index/fts.test.ts` (the existing test "indexes ordered attempt hypotheses and descriptions" must still pass or be adjusted to the new contract). Do not run the live index rebuild; print the exact CLI command that rebuilds the attempt index so the operator can run it.

## Change 2 — narrative in worker-facing results
In `apps/server/src/core/knowledge-v2/tools.ts`:
- `kv2AttemptSearch`: group hits by run and add per run `narrative: { summary, observations: [{observation, reusable_when}] } | null` (summary truncated to ~600 chars, at most 3 observations, each truncated to ~300 chars). Keep existing fields so callers do not break.
- `kv2ResolveLocator` for `attempt://run/<id>` (and `/submission/<n>`): include the run narrative `{ summary, notable_observations, narrative }` bounded to ~6,000 chars total.
- `kv2SubjectRecord`: ledger entries already carry `workerRun.summary`; additionally include for the newest 3 runs `notable_observations` (bounded as above) under a `prior_runs` field.
Update the result type interfaces and the wrapper schemas' documented output if they describe result shapes. Add tests in `tools.test.ts` covering: query search hits narrative text; resolve_locator returns the narrative; subject record has `prior_runs`.

## Change 3 — card data for the worker boot context
Add to `apps/server/src/core/knowledge-v2/card.ts` (keep `buildV2TargetCard`'s signature; another task consumes the new fields):
- `prior_runs`: newest 3 (`full`) / 2 (`compact`) / 1 (`minimal`) worker runs for the target: `{ outcome, integration, baseline_score, best_score, closed_at, summary, observations: [{observation, reusable_when}] (≤2), unresolved_diagnosis? }`. `unresolved_diagnosis` is the newest non-`match` run's summary (≤400 chars), present only when the newest run did not match.
- `accepted_prs`: newest 3/2/1 `pull_request` rows attributed to the target or its unit with `outcome === "match"`: `{ pr_ref, attribution, summary (≤300 chars), locator }`.
- Facts: add `evidence: { kind, locator, why (≤200 chars) }` for the single best evidence row per fact (prefer `attempt`/`pr` over `code` when equally confident; else highest capturedAt).
- Ledger entries: truncate each submission `description` to 400 chars.
- A total character budget on the rendered card: 6,000 / 3,500 / 1,500 by budget. Enforce by trimming, in this order: extra ledger entries beyond the first 6, link facts, accepted_prs beyond 1, observations beyond 1, then descriptions to 200 chars. Never drop `prior_runs[0]` or `status`.
Tests in `card.test.ts` (create if absent) with a fixture store: prior_runs present with observations; unresolved_diagnosis logic; budget enforcement.

## Rules
- Bun test: `cd apps/server && bun test src/core/knowledge-v2` must pass. Also run `bun run typecheck` if the repo has it (check package.json), else `bunx tsc --noEmit -p apps/server` if that is the configured way.
- Print a summary at the end: files changed, tests added, and the index rebuild command. Print DONE.
