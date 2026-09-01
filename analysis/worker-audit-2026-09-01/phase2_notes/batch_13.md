# Worker-Audit Phase 2, Batch 13

## Batch Shape

80 workers: 10 exact, 29 near-miss, 34 progressed, and 7 no-progress.

## Technique Counts by Cohort

- Exact: `asm-diff-instruction-level` 7, `inline-hypothesis` 7, `loop-restructure` 6, `register-allocation-reasoning` 6, `sibling-function-lookup` 6, `lifetime-scope-experiments` 5, `declaration-order-experiments` 4, `permuter` 4, `type-shape-experiments` 4, `same-unit-regression-checks` 3, `stack-layout-tuning` 3, `checkpoint-restore` 2, `helper-boundary-experiments` 2, `past-source-lookup` 2, `typed-user-data-access` 2; 17 other techniques appeared once.
- Near-miss: `permuter` 24, `asm-diff-instruction-level` 23, `register-allocation-reasoning` 20, `lifetime-scope-experiments` 16, `declaration-order-experiments` 15, `type-shape-experiments` 15, `inline-hypothesis` 13, `checkpoint-restore` 10, `loop-restructure` 9, `allocator-trace` 8, `sibling-function-lookup` 7, `stack-layout-tuning` 7, `past-source-lookup` 5, `same-unit-regression-checks` 5, `stack-padding-experiments` 5, `helper-boundary-experiments` 4; 13 techniques appeared 2-3 times and 31 appeared once.
- Progressed: `asm-diff-instruction-level` 29, `register-allocation-reasoning` 29, `permuter` 26, `declaration-order-experiments` 21, `lifetime-scope-experiments` 21, `type-shape-experiments` 21, `inline-hypothesis` 15, `loop-restructure` 12, `stack-layout-tuning` 12, `expression-shape-experiments` 8, `expression-reordering` 6, `past-source-lookup` 6, `checkpoint-restore` 4, `helper-boundary-experiments` 4, `allocator-trace` 3, `pointer-alias-experiments` 3, `pointer-shape-experiments` 3, `sibling-function-lookup` 3, `stack-padding-experiments` 3, `typed-field-access` 3; 4 techniques appeared twice and 39 appeared once.
- No-progress: `permuter` 7, `inline-hypothesis` 6, `lifetime-scope-experiments` 6, `asm-diff-instruction-level` 5, `declaration-order-experiments` 5, `register-allocation-reasoning` 5, `loop-restructure` 4, `past-source-lookup` 3, `type-shape-experiments` 3, `checkpoint-restore` 2, `pointer-expression-shape` 2, `stack-padding-experiments` 2; 18 other techniques appeared once.

## Three Exact-Worker Accounts

- `14d4bc16-6e76-4f27-88f2-4f0ef630fb4f`: Literal-pool reordering plus value-based relocation scoring moved the runner to 100%. Strict objdiff still found two relocation-symbol mismatches from an over-merged string symbol, an important gap between the runner's exact label and object-level identity.
- `5362dd1d-9366-4c14-a90a-ae7bedd924d8`: A 5,200-candidate permuter search found nothing. Semantic helper recovery and `PAD_STACK(16)` then preserved pointer lifetimes and the retail frame closely enough to reach 100%.
- `d5049af5-a570-46f5-9c33-e9910b2abe50`: Repeated local probes stalled on 24 register-operand mismatches. Restoring authored traversal helpers and natural JObj recursion closed the gap, while call-site inline barriers protected an exact neighbor.

## Most Common Stall Reason

- Exact: no stall reason for 10 of 10 workers; one account still noted relocation differences despite its exact runner score.
- Near-miss: register allocation or coloring, 19 of 29 workers.
- Progressed: register allocation or coloring, 31 of 34 workers.
- No-progress: register allocation or coloring, 5 of 7 workers.

## Surprises

- `b9f47583-fdc6-430c-b3de-373b568ca8ad` reported that the target was already 100% and made no edits, despite the batch labeling it near-miss.
- Several near-miss and no-progress workers demonstrated 100% diagnostic builds but could not retain them because the true prototype, type, or BSS declaration lived outside the write set.
- Permuter use was universal in the no-progress cohort, but the exact accounts repeatedly credit semantic helper recovery, natural loop shape, local lifetime order, or stack calibration for the final step.
