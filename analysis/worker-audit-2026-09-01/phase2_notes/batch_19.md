# Worker-Audit Phase 2, Batch 19

80 workers: 6 exact, 33 near-miss, 17 progressed, 24 no-progress.

## Technique Counts by Cohort

| Cohort | Most reported techniques |
|---|---|
| exact | `asm-diff-instruction-level` 3, `register-allocation-reasoning` 2, `neighbor-regression-check` 2, `stack-layout-reasoning` 2, `stack-padding` 2, `permuter` 2, `inline-hypothesis` 2, `must-match-liveness-marker` 1, `inline-abi-shaping` 1, `expression-inlining` 1; other techniques 17 mentions across 17 slugs |
| near_miss | `permuter` 23, `asm-diff-instruction-level` 22, `allocator-diagnostics` 18, `inline-hypothesis` 17, `register-allocation-reasoning` 16, `lifetime-scope-shaping` 15, `type-shape-experiments` 14, `past-source-lookup` 13, `declaration-order-experiments` 11, `helper-boundary-experiments` 8; other techniques 66 mentions across 34 slugs |
| progressed | `asm-diff-instruction-level` 12, `permuter` 9, `register-allocation-reasoning` 8, `lifetime-scope-shaping` 8, `type-shape-experiments` 6, `stack-padding` 6, `declaration-order-experiments` 5, `loop-restructure` 4, `inline-hypothesis` 4, `allocator-diagnostics` 3; other techniques 43 mentions across 34 slugs |
| no_progress | `permuter` 12, `asm-diff-instruction-level` 11, `type-shape-experiments` 10, `declaration-order-experiments` 9, `register-allocation-reasoning` 9, `allocator-diagnostics` 8, `lifetime-scope-shaping` 6, `inline-hypothesis` 6, `loop-restructure` 5, `expression-shape-experiments` 4; other techniques 46 mentions across 31 slugs |

Counts are worker-level mentions after merging obvious slug synonyms. The "other" bucket preserves all lower-frequency techniques in the JSON.

## Three Exact Accounts

`4200b750-79b1-4768-a4db-1113cd5aa765`: The worker traced the last mismatch to four `sqrtf` spill pairs occupying stack slots eight bytes too low. A `MUST_MATCH` inline identity helper reserved the retail operand area and reached exact without changing the frame or attack-array layout.

`be134157-4f45-4915-b3b8-9211dbf76e1e`: Instruction-level diffs isolated the remaining mismatch to floating-point lifetimes. Destructively reusing `base_y` for the final cursor calculation reproduced the target FPR allocation.

`46e962c3-632b-43d3-aed5-83f2abcd396a`: The starting `.sdata2` match was only 68.2353%. Reconstructing constant order, emitting duplicate translation-unit-owned constants, and matching alignment closed the entire section while keeping previously exact functions intact.

## Common Stall Reasons

- Exact: none. All six summaries identify a closing change.
- Near-miss: register allocation or register-coloring conflicts, 21 of 26 workers with a stated stall.
- Progressed: register allocation coupled to stack layout, call scheduling, or control flow, 11 of 14 workers with a stated stall.
- No-progress: register allocation or lifetime scheduling, 11 of 17 workers with a stated stall.

## Surprises

- Ten workers had no direct `worker_*.txt`; one more had only a database-lock provider error. Their loop quality is `unknown`, with no inferred techniques.
- Two self-reports conflict with the batch outcome: `d4c6...` claims a retained 99.78082 improvement despite a 98.7363 batch best, and `c218...` claims byte-identical `.sdata2` despite a 22.06% no-progress row.
- Exact fixes were unusually surgical: liveness reuse, inline stack shaping, helper boundaries, or section-object reconstruction, rather than broad variant search.
