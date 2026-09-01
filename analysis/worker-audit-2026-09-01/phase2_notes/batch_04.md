# Worker-audit Phase 2, Batch 04

Workers: **80**. Cohorts include exact 5, near_miss 20, progressed 17, and no_progress 38. All 80 artifact directories had at least one `worker_*.txt` summary.

## Technique counts by cohort

- **exact (5 workers):** `float-literal-tricks` 4, `relocation-analysis` 2, `sdata2-order-reconstruction` 2, `asm-diff-instruction-level` 1, `data-layout-analysis` 1, `loop-restructure` 1, `scoped-local-lifetime` 1, `sentinel-value-correction` 1, `stack-layout-analysis` 1, `stack-padding-adjustment` 1, `type-shape-experiments` 1, `union-byte-view` 1
- **near_miss (20 workers):** `asm-diff-instruction-level` 16, `checkpoint-restore` 14, `register-allocation-reasoning` 14, `declaration-order-experiments` 13, `permuter` 12, `scoped-local-lifetime` 10, `type-shape-experiments` 7, `stack-padding-adjustment` 6, `historical-source-lookup` 5, `inline-hypothesis` 5, `loop-restructure` 5, `direct-expression-substitution` 4, `stack-layout-analysis` 3, `control-flow-restructure` 2, `mwcc-allocator-snapshot` 2, `past-pr-lookup` 2, `register-flow-diagnostics` 2, `relocation-analysis` 2, `bss-layout-reasoning` 1, `data-layout-analysis` 1, `data-relocation-reasoning` 1, `direct-global-access` 1, `float-literal-tricks` 1, `helper-boundary-experiments` 1, `instruction-scheduling-experiments` 1, `linkage-layout-experiments` 1, `loop-counter-experiments` 1, `loop-counter-reuse` 1, `nearby-function-lookup` 1, `pointer-lifetime-experiments` 1, `pointer-shape-experiments` 1, `raw-offset-elimination` 1, `sdata2-order-reconstruction` 1, `string-pool-order-helper` 1, `temporary-elimination` 1, `type-width-experiments` 1, `variable-reuse-experiments` 1, `volatile-experiment` 1
- **progressed (17 workers):** `asm-diff-instruction-level` 11, `permuter` 10, `register-allocation-reasoning` 8, `scoped-local-lifetime` 8, `checkpoint-restore` 7, `declaration-order-experiments` 6, `inline-hypothesis` 4, `stack-layout-analysis` 4, `historical-source-lookup` 3, `loop-restructure` 3, `alias-lifetime-experiment` 2, `helper-boundary-experiments` 2, `nearby-function-lookup` 2, `past-pr-lookup` 2, `alias-elimination` 1, `common-subexpression-reuse` 1, `direct-array-access` 1, `direct-array-base` 1, `direct-global-access` 1, `expression-precompute` 1, `float-literal-tricks` 1, `inline-expression` 1, `ledger-lookup` 1, `operand-order-experiments` 1, `pointer-lifetime-experiments` 1, `pointer-shape-experiments` 1, `sdata2-order-reconstruction` 1, `stack-padding-adjustment` 1, `temporary-elimination` 1, `temporary-introduction` 1, `type-shape-experiments` 1, `type-width-experiments` 1, `typed-field-addressing` 1, `volatile-experiment` 1
- **no_progress (38 workers):** `asm-diff-instruction-level` 37, `permuter` 32, `register-allocation-reasoning` 29, `declaration-order-experiments` 27, `checkpoint-restore` 25, `scoped-local-lifetime` 20, `type-shape-experiments` 16, `historical-source-lookup` 9, `inline-hypothesis` 9, `nearby-function-lookup` 8, `stack-padding-adjustment` 8, `loop-restructure` 7, `mwcc-allocator-snapshot` 7, `stack-layout-analysis` 7, `alias-lifetime-experiment` 6, `helper-boundary-experiments` 6, `ledger-lookup` 4, `past-pr-lookup` 4, `qemu-compiler-workaround` 4, `alias-elimination` 3, `control-flow-restructure` 3, `pointer-walk-rewrite` 3, `register-flow-diagnostics` 3, `bss-ownership-reconstruction` 2, `declaration-initialization-experiments` 2, `direct-field-access` 2, `pointer-shape-experiments` 2, `variable-reuse-experiments` 2, `accessor-substitution` 1, `asm-window-analogue-search` 1, `compile-validation` 1, `conditional-expression-experiments` 1, `data-layout-analysis` 1, `direct-array-access` 1, `direct-global-access` 1, `direct-struct-access` 1, `float-expression-reordering` 1, `instruction-scheduling-analysis` 1, `integer-canonicalization` 1, `lifetime-use-marker` 1, `loop-condition-experiments` 1, `loop-variable-reuse` 1, `macro-shape-experiment` 1, `pointer-base-unification` 1, `pointer-recomputation` 1, `shared-local-experiments` 1, `type-narrowing-experiments` 1, `typed-array-access` 1, `typed-local-restoration` 1, `volatile-qualifier-experiments` 1

## Three exact-worker accounts

**154e451d-ec65-4d6e-bd4d-2d689ea04e7a:** The worker isolated the last gap to a malformed maximum-float sentinel. Changing `3.4028235e28f` to `-3.4028235e38f` restored the expected relocation and reached exact.

**63f4c0f1-0afe-4cb7-9218-4252f0d9cf25:** A packed `JObjIndices` union with typed byte-walker loops fixed every instruction mismatch. Standalone scoring still named four relocations differently, but runner data-value validation recorded 100%.

**03f25a33-7b78-4ee1-bf82-6b473c53cab8:** The body needed a `0.01f` argument correction, while a sanctioned ordering helper reconstructed all 35 `.sdata2` entries. Together those code and data-layout changes closed the gap.

## Most common stall reason by cohort

- **exact:** none; all five report a closing factor instead.
- **near_miss:** no exact phrase repeated; register-allocation mismatches dominate the distinct descriptions.
- **progressed:** no exact phrase repeated; remaining register/source-shape allocation differences dominate.
- **no_progress:** `compiler-wrapper execution failure` (3); many other unique descriptions are register-coloring variants.

## Surprises

- Several summaries described opcode-identical or instruction-identical output that still missed because of relocation identity or register provenance.
- Workers repeatedly rejected higher-scoring permuter outputs when they required implausible micro-helpers or prohibited `volatile` locals.
- Broken 32-bit compiler execution was sometimes bypassed with `qemu-i386`, but elsewhere prevented validation entirely.
