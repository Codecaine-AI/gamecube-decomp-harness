# Batch 08 Self-Summary Sweep

## Cohort Sizes

Exact 1, near_miss 20, progressed 22, no_progress 37.

## Technique Counts by Cohort

Counts are workers mentioning the technique. To keep the sweep readable, the tables show techniques used by at least two workers; singleton slugs are counted separately. The exact cohort lists its five singleton techniques because it contains only one worker.

Exact: `asm-diff-instruction-level` 1, `checkpoint-restore` 1, `declaration-order-experiments` 1, `sdata2-ordering-experiments` 1, `stack-layout-reasoning` 1.

Near miss:

| Technique | Count | Technique | Count |
|---|---:|---|---:|
| asm-diff-instruction-level | 17 | checkpoint-restore | 14 |
| permuter | 14 | register-allocation-reasoning | 12 |
| declaration-order-experiments | 9 | type-shape-experiments | 7 |
| variable-lifetime-experiments | 7 | allocator-snapshot | 5 |
| mwcc-diagnostics | 4 | local-lifetime-experiments | 3 |
| mwcc-regflow-diagnostics | 3 | regflow-diagnostics | 3 |
Nine other techniques appeared twice; 49 appeared once.

Progressed:

| asm-diff-instruction-level | 20 | permuter | 12 |
| checkpoint-restore | 11 | register-allocation-reasoning | 11 |
| declaration-order-experiments | 10 | inline-hypothesis | 8 |
| compiler-regflow-diagnostics | 5 | type-shape-experiments | 4 |
| ledger-lookup | 3 | loop-restructure | 3 |
| stack-layout-diagnostics | 3 | stack-padding-experiments | 3 |
Seventeen other techniques appeared twice; 29 appeared once.

No progress:

| asm-diff-instruction-level | 30 | permuter | 30 |
| register-allocation-reasoning | 29 | declaration-order-experiments | 26 |
| checkpoint-restore | 22 | inline-hypothesis | 10 |
| mwcc-regflow-diagnostics | 9 | type-shape-experiments | 9 |
| variable-lifetime-experiments | 9 | allocator-snapshot | 8 |
| compiler-regflow-diagnostics | 8 | loop-restructure | 7 |
Thirty-one other techniques appeared two to six times; 42 appeared once.

## Exact-Worker Accounts

Only one exact worker exists in this batch, so three exact accounts cannot be selected. `7e2da56a-e0cf-4286-aefb-b6339ba565cc` attributed its gain to declaring `Mtx` before `Vec3`, which restored the intended stack-slot layout. Its sole summary still reported 99.85782% and six `.sdata2` relocation mismatches, conflicting with the batch's 100% score.

## Common Stall Reasons

| Cohort | Most Common Stall Family |
|---|---|
| exact | None reported |
| near_miss | Register allocation, 12 of 19 workers with a stated stall |
| progressed | Register allocation, 16 of 20 workers with a stated stall |
| no_progress | Register allocation, 20 of 37 workers; tool or validation failures were next at 8 |

## Surprise

The sharpest surprise was not a source trick but the audit metadata conflict on the only exact worker. One near-miss worker had no direct `worker_*.txt` summary, and several no-progress accounts spent their whole run blocked by an incompatible 32-bit `wibo` rather than by code generation.
