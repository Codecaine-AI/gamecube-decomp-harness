# Current PR QA Repair Campaign Final Report

Date: 2026-06-13

## Status

The live QA repair campaign reduced the deterministic current-PR QA queue from
54 files with 800 errors / 327 warnings to 3 files with 144 errors / 230
warnings.

Post-compaction audit result: the QA repair campaign objective is complete as
`routed-blocked`, not PR-ready. The required context was reread, the routed JSON
artifacts parse, the 32-slot supervisor manifests exist, and every remaining
queued error item is named below with a route, reason, next action, and worker
artifact.

The primary checkout builds with the accepted campaign patches:

- `ninja changes_all` from `projects/melee/checkout`: passed.

The full PR promotion regression gate is still blocked:

- Command:
  `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" regression-check --run-id current-pr-qa-repair-campaign --target changes_all --require-pr-promotion --qa-base origin/master`
- Artifact:
  `.decomp-orchestrator-state/qa-repair-campaign/regression_checks/current-pr-qa-repair-campaign/2026-06-13T16-59-26-816Z/pr_report.md`
- Result: exit 1 after a successful `changes_all` build.
- Blockers: 48 metric regressions, 10 broken exact matches, 19 unmatched-item
  fuzzy regressions, plus QA counts of 144 errors / 230 warnings.

Because this gate failed, `pr-split-plan` was run only as a routed
ship-status compatibility check and is not PR-ready evidence. Preship review
was not run.

## Current Ship Status

Latest QA repair replay:

- Artifact:
  `.decomp-orchestrator-state/qa-repair-campaign/qa_repairs/current-pr-qa-repair-campaign/2026-06-13T16-55-17-904Z/`
- `ship_status.json` status: `qa_repair_pending`
- Candidate files: 21
- Shipped files: 18
- Dropped files: 3

Routed handoff artifacts were added beside the raw queue:

- `.decomp-orchestrator-state/qa-repair-campaign/qa_repairs/current-pr-qa-repair-campaign/2026-06-13T16-55-17-904Z/final_routing.json`
- `.decomp-orchestrator-state/qa-repair-campaign/qa_repairs/current-pr-qa-repair-campaign/2026-06-13T16-55-17-904Z/ship_status.routed.json`
- `.decomp-orchestrator-state/qa-repair-campaign/qa_repairs/current-pr-qa-repair-campaign/2026-06-13T16-55-17-904Z/report.routed.md`
- `.decomp-orchestrator-state/qa-repair-campaign/qa_repairs/current-pr-qa-repair-campaign/2026-06-13T16-55-17-904Z/pr_split_plan.routed.with-report.md`

The routed ship status is `qa_repair_blocked`: 18 shipped warning-only files
and 3 dropped blocked files. The routed split plan generated 2 match slices and
19 local-only slices; it moves the blocked QA files to the local lane but is
not PR-ready while the regression promotion gate is blocked.

## Blocked Routes

`src/melee/gm/gm_1601.c`

- Current QA: 97 errors, 14 warnings.
- Primary rules: `m2c_residue_names`, `m2c_field_use`, `m2c_goto_label`,
  `type_erasing_cast`.
- Latest worker produced a clean-lower-score patch, but it edited
  `src/melee/gm/gm_1601.static.h` outside the item lease. The supervisor
  refused the merge.
- Latest artifact:
  `.decomp-orchestrator-state/qa-repair-campaign/qa_repair_campaign_supervisor/current-pr-qa-repair-campaign/2026-06-13T16-50-38-994Z/workers/worker-004-src-melee-gm-gm-1601/src-melee-gm-gm-1601/src-melee-gm-gm-1601.patch`
- Route: blocked until the header edit is explicitly authorized in a wider
  lease, or the repair is redone as an item-only change.

`src/melee/gm/gmregclear.c`

- Current QA: 13 errors, 10 warnings.
- Primary rules: `m2c_residue_names`, `extern_literal_anchor`,
  `string_literal_to_symbol`, `type_erasing_cast`, `m2c_goto_label`.
- Repeated workers returned `needs_rework`; the latest post-repair scan still
  had 7 item errors, so the patch was not merged.
- Latest artifact:
  `.decomp-orchestrator-state/qa-repair-campaign/qa_repair_campaign_supervisor/current-pr-qa-repair-campaign/2026-06-13T16-50-38-994Z/workers/worker-005-src-melee-gm-gmregclear/src-melee-gm-gmregclear/src-melee-gm-gmregclear.patch`
- Route: blocked as repeated residual QA after repair attempts.

`src/melee/gr/ground.c`

- Current QA: 34 errors, 7 warnings.
- Primary rules: `m2c_residue_names`, `string_literal_to_symbol`,
  `unrolled_assert`, `m2c_goto_label`.
- Repeated workers returned schema failures or `needs_rework`; the latest
  post-repair scan still had 6 item errors, so the patch was not merged.
- Latest artifact:
  `.decomp-orchestrator-state/qa-repair-campaign/qa_repair_campaign_supervisor/current-pr-qa-repair-campaign/2026-06-13T16-50-38-994Z/workers/worker-006-src-melee-gr-ground/src-melee-gr-ground/src-melee-gr-ground.patch`
- Route: blocked as repeated residual QA after repair attempts.

## Working Tree

The primary Melee checkout still contains accepted uncommitted campaign edits.
At handoff, `git -C projects/melee/checkout status --short --ignore-submodules=all`
listed 51 modified files. Do not revert unrelated work.

## Next Actions

- Decide whether `gm_1601.static.h` may be included in a wider `gm_1601`
  repair lease.
- If the current PR is being prepared for handoff, isolate the shippable match
  lane from the local-only repair improvements and rerun the PR promotion gate.
- Re-run regression and preship review only after the regression gate is clean
  or the blockers above are intentionally excluded from the ship set.
