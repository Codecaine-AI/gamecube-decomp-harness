# Batch 02 Worker Self-Summary Sweep

80 records: 1 exact, 17 near-miss, 37 progressed, 26 no-progress.

## Technique Counts by Cohort

- exact: asm-diff-instruction-level 1; checkpoint-restore 1; expression-reordering 1; float-literal-tricks 1; register-allocation-reasoning 1; type-shape-experiments 1.
- near_miss: analogous-function-lookup 1; asm-diff-instruction-level 16; bss-symbol-split 1; checkpoint-restore 11; compiler-regflow-diagnostics 1; compiler-stack-diagnostics 1; data-layout-recovery 1; declaration-order-experiments 8; expression-reordering 4; float-literal-tricks 1; float-stack-shape-analysis 1; inline-hypothesis 8; local-lifetime-experiments 2; loop-restructure 5; metadata-ownership-analysis 1; past-pr-lookup 4; past-source-lookup 1; permuter 13; pointer-lifetime-experiments 1; pointer-walk-experiments 1; register-allocation-reasoning 13; relocation-analysis 1; stack-padding-experiments 1; string-literal-ordering 1; struct-layout-experiments 2; type-shape-experiments 14.
- progressed: analogous-function-lookup 2; array-size-experiments 1; asm-diff-instruction-level 31; bss-layout-reasoning 1; cast-experiment 1; checkpoint-restore 10; compiler-flag-experiments 1; compiler-regflow-diagnostics 2; compiler-stack-diagnostics 2; control-flow-restructure 5; declaration-order-experiments 22; explicit-initialization-experiment 1; expression-reordering 8; expression-shape-experiments 1; expression-simplification 1; field-store-reordering 1; fpr-flow-reasoning 1; git-history-lookup 1; header-layout-reasoning 1; header-prototype-hypothesis 1; helper-extraction 1; helper-shape-experiments 1; inline-hypothesis 12; literal-argument-recovery 1; local-lifetime-experiments 8; loop-initializer-recovery 1; loop-restructure 10; parameter-order-experiment 1; past-pr-lookup 1; permuter 24; pointer-lifetime-experiments 3; pointer-local-rewrite 1; pointer-walk-experiments 2; register-allocation-reasoning 28; related-source-lookup 1; scoped-temporary-load 1; source-shape-experiments 1; stack-frame-reasoning 1; stack-padding-experiments 8; struct-layout-experiments 3; temporary-elimination 1; type-shape-experiments 17; typed-local-introduction 1; typed-pointer-recovery 1; volatile-experiments 2.
- no_progress: asm-diff-instruction-level 16; checkpoint-restore 13; control-flow-restructure 2; data-layout-experiment 1; declaration-order-experiments 13; expression-reordering 8; inline-hypothesis 6; loop-restructure 6; parameter-order-experiments 1; past-pr-lookup 8; permuter 14; pointer-lifetime-experiments 1; pointer-walk-experiments 1; prototype-shape-experiment 1; register-allocation-reasoning 15; signature-width-analysis 1; stack-padding-experiments 1; type-shape-experiments 13.

## Exact-Worker Accounts

Only one exact worker exists in this batch, so there are not three accounts to rank.

- `fbe12874-df73-4565-b9eb-6cc310ee9ae5`: The diff had narrowed to one `fcmpo` operand mismatch, f5 instead of f6. Reusing an existing temporary for the second sign comparison changed the FPR choice and closed the gap.

## Most Common Stall Reason

- exact: none.
- near_miss: register allocation or coloring, 12 of 16 workers with a stated stall.
- progressed: register allocation or coloring, 28 of 37.
- no_progress: register allocation or coloring, 11 of 16 workers with a stated stall.

## Surprises

- Ten workers had no usable account because their summaries contained provider or timeout errors.
- Several workers found likely canonical fixes in owning headers or private layouts but could not test them inside their writable source slice.
- Workers often rejected higher-scoring permuter output when it depended on synthetic branches or generated-helper residue. That restraint was unusually explicit.
