# Batch 09 Self-Summary Sweep

## Technique Counts by Cohort

Workers: exact 4, near_miss 17, progressed 40, no_progress 19.

| Technique | Exact | Near miss | Progressed | No progress |
|---|---:|---:|---:|---:|
| asm-diff-instruction-level | 3 | 16 | 32 | 19 |
| permuter | 3 | 14 | 29 | 18 |
| register-allocation-reasoning | 1 | 13 | 21 | 17 |
| variable-lifetime-shaping | 2 | 7 | 26 | 11 |
| type-shape-experiments | 4 | 9 | 21 | 9 |
| declaration-order-experiments | 1 | 7 | 16 | 13 |
| checkpoint-restore | 1 | 5 | 15 | 15 |
| inline-hypothesis | 2 | 9 | 18 | 7 |
| stack-layout-reasoning | 1 | 6 | 12 | 10 |
| loop-restructure | 1 | 6 | 14 | 7 |
| expression-shape-experiments | 1 | 7 | 14 | 4 |
| past-pr-lookup | 0 | 4 | 14 | 5 |
| variable-shape-experiments | 2 | 4 | 11 | 0 |
| pointer-shape-experiments | 2 | 2 | 5 | 5 |
| data-layout-reasoning | 0 | 4 | 5 | 3 |
| argument-order-experiments | 0 | 1 | 2 | 5 |
| neighbor-regression-check | 0 | 2 | 2 | 3 |
| control-flow-restructure | 1 | 2 | 3 | 0 |
| float-literal-tricks | 0 | 2 | 3 | 1 |
| linkage-layout-experiments | 0 | 3 | 2 | 0 |
| compiler-diagnostics | 1 | 1 | 1 | 0 |
| instruction-scheduling-reasoning | 0 | 2 | 1 | 0 |
| qa-gate-repair | 0 | 1 | 2 | 0 |
| accessor-shape-experiment | 0 | 1 | 0 | 1 |
| declaration-cleanup | 0 | 1 | 1 | 0 |
| direct-global-access | 0 | 1 | 1 | 0 |
| helper-shape-experiments | 0 | 0 | 2 | 0 |
| literal-shape-experiments | 0 | 1 | 0 | 1 |
| relocation-analysis | 0 | 1 | 0 | 1 |
| volatile-shaping | 0 | 0 | 1 | 1 |
| condition-record-reasoning | 1 | 0 | 0 | 0 |
| dependency-injection | 0 | 1 | 0 | 0 |
| explicit-void-use | 0 | 1 | 0 | 0 |
| global-reload-experiments | 0 | 0 | 1 | 0 |
| helper-boundary-experiments | 0 | 0 | 0 | 1 |
| sibling-function-comparison | 0 | 1 | 0 | 0 |
| split-config-analysis | 0 | 1 | 0 | 0 |
| zero-initialization-experiments | 0 | 1 | 0 | 0 |

## Three Exact Accounts

- `b9db3bdd-3451-46b9-9806-8aa6fe1c22a5`: Three by-value `GXColor` temporaries occupied the wrong stack slots. Two used padding locals moved them to `0x118`, `0x11C`, and `0x120` and closed the match.
- `58db912a-2eab-4092-b18b-265938ac6a7b`: PCode counts tied a two-instruction mismatch to condition-register placement. A scoped `MUST_MATCH` `u16` copy moved the condition-record update into place.
- `a9872728-d65f-4b92-8804-86dabc0f33bd`: Typed pointer forms emitted the wrong address operands. A pointer-view union plus byte cursor produced exact `+0x74` and `+0x75` addressing.

## Common Stall Reasons

Exact: none. Near miss: register allocation or coloring, 10/17. Progressed: 35/40. No progress: 13/19.

## Surprise

All 80 workers left summaries. Exact fixes included explicit stack padding, condition-register steering, a typed pointer union, and typed aliases that resolved a saved-register swap.
