# Task: Worker-audit Phase 2 rollup — aggregate the summary sweep (1,627 workers)

AUDIT_DIR = `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/analysis/worker-audit-2026-09-01`

Inputs: `AUDIT_DIR/phase2_notes/batch_*.json` (21 files, 1,627 records total; fields: ws_id, cohort, epoch, target_key, techniques[], stall_reason, success_factor, loop_quality, notable) and `AUDIT_DIR/phase2_notes/batch_*.md` (qualitative batch notes).

Use scripting for all counting (stdlib only); use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

Write exactly one file: `AUDIT_DIR/rollups/phase2_rollup.md`, containing:

## Technique prevalence by cohort
Normalize technique slugs first (merge obvious synonyms/hyphen-underscore variants; keep a mapping note). Table: for each of the ~20 most common techniques, % of workers mentioning it in exact / near_miss / progressed / no_progress, plus exact-minus-near_miss gap in pp. Sort by absolute gap.

## Loop quality by cohort
Table of loop_quality (systematic/mixed/shotgun/unknown) percentage per cohort.

## Stall reasons
Top 12 normalized stall_reason categories with counts per cohort (group free-text into families: regalloc, instruction scheduling, stack frame, relocation/data, float/literal, control flow shape, inlining, other, unknown).

## Success factors
Top 10 normalized success_factor families among exact workers, with counts and 3 verbatim examples each (short).

## Notables
The 10 most interesting `notable` entries across all batches (verbatim, with ws_id and cohort) — prefer ones that reveal process, tooling problems, or system issues.

## Batch-note synthesis
5-10 bullets distilling recurring observations from the 21 batch .md files, deduplicated.

Keep it under 220 lines. Counting must come from the JSON via script, not estimation. Print DONE plus total records counted when finished.
