# Batch 03 Self-Summary Sweep

80 workers: 1 exact, 19 near-miss, 33 progressed, 27 no-progress.

## Technique Counts by Cohort

Counts below include every normalized technique slug used in the JSON.

- **exact**: allocator-snapshot 1, asm-diff-instruction-level 1, assignment-in-condition 1, control-flow-restructure 1, helper-removal 1, local-temporary-recovery 1, permuter 1, register-allocation-reasoning 1, type-shape-experiments 1
- **near_miss**: asm-diff-instruction-level 17, permuter 17, declaration-order-experiments 14, register-allocation-reasoning 14, type-shape-experiments 14, allocator-snapshot 10, checkpoint-restore 8, local-lifetime-scoping 6, pointer-lifetime-shaping 6, inline-hypothesis 5, past-pr-lookup 5, stack-padding-adjustment 5, loop-restructure 3, past-source-lookup 3, solved-analog-lookup 3, data-section-layout-analysis 2, float-literal-tricks 2, past-checkpoint-lookup 2, symbol-ownership-analysis 2, write-set-widening-request 2, alias-lifetime-experiments 1, anchored-buffer-indexing 1, config-metadata-analysis 1, control-flow-restructure 1, expression-reordering 1, helper-boundary-experiments 1, helper-reuse 1, linkage-experiments 1, local-temporary-recovery 1, macro-shape-restoration 1, parameter-lifetime-experiments 1, relocation-symbol-analysis 1, sibling-source-comparison 1, signed-loop-index 1, stack-layout-experiments 1, stack-layout-reasoning 1, struct-layout-analysis 1
- **progressed**: permuter 24, register-allocation-reasoning 23, asm-diff-instruction-level 22, declaration-order-experiments 22, type-shape-experiments 18, checkpoint-restore 12, stack-layout-reasoning 9, inline-hypothesis 8, stack-padding-adjustment 8, local-lifetime-scoping 7, expression-reordering 6, sibling-source-comparison 6, allocator-snapshot 4, float-literal-tricks 3, loop-restructure 3, solved-analog-lookup 3, comparison-operand-order 2, past-checkpoint-lookup 2, pointer-lifetime-shaping 2, canonical-type-reuse 1, control-flow-restructure 1, cross-tu-signature-analysis 1, data-layout-reasoning 1, data-ownership-recovery 1, data-section-layout-analysis 1, expression-temporary 1, float-bit-pattern-experiments 1, float-register-flow-reasoning 1, header-signature-audit 1, helper-boundary-recovery 1, helper-reuse 1, inline-boundary-recovery 1, instruction-scheduling 1, local-value-caching 1, loop-condition-idiom 1, loop-counter-reuse 1, loop-counter-type-experiments 1, loop-lifetime-experiments 1, operand-order-experiments 1, past-pr-lookup 1, past-source-lookup 1, pointer-loop-restructure 1, raw-offset-diagnostic-probe 1, relocation-analysis 1, sdata-layout-reconstruction 1, stack-slot-shaping 1, struct-layout-analysis 1, symbol-metadata-lookup 1, temporary-materialization 1, temporary-removal 1, typed-field-accessors 1, volatile-local-experiment 1, volatile-temporary-array 1, write-set-widening 1, write-set-widening-request 1
- **no_progress**: asm-diff-instruction-level 24, permuter 23, checkpoint-restore 21, type-shape-experiments 21, register-allocation-reasoning 20, allocator-snapshot 16, declaration-order-experiments 16, inline-hypothesis 9, loop-restructure 9, past-pr-lookup 8, past-source-lookup 6, local-lifetime-scoping 5, solved-analog-lookup 5, stack-padding-adjustment 4, pointer-lifetime-shaping 3, relocation-analysis 3, stack-layout-reasoning 3, float-literal-tricks 2, header-signature-audit 2, symbol-metadata-lookup 2, type-overlay-experiments 2, alias-lifetime-experiments 1, arithmetic-shape-experiments 1, bss-layout-reconstruction 1, comma-expression-experiments 1, cross-tu-signature-analysis 1, cross-tu-symbol-lookup 1, data-ownership-recovery 1, data-symbol-scope 1, function-signature-hypothesis 1, helper-boundary-experiments 1, helper-signature-experiments 1, initializer-shape-experiments 1, nearby-function-lookup 1, sdata-layout-reconstruction 1, sdata2-order-anchor 1, sibling-function-comparison 1, symbol-metadata-inspection 1, write-set-widening 1, write-set-widening-request 1

## Exact-Worker Accounts

The batch contains only one exact worker, so three exact accounts do not exist.

- `4969abd6-8c73-496a-98bf-6c3546e57b2f`: The worker removed a synthetic one-use wrapper, assigned the typed result inside the condition, and introduced a local `HSD_JObj*`. Those changes broke the saved-register cycle and produced the target allocation at 100%.

## Most Common Stall Reason by Cohort

- **exact**: none; the sole worker finished.
- **near_miss**: no exact phrase repeated. Register-allocation mismatches dominate, often a single register swap or short mismatch window.
- **progressed**: `floating-point register allocation` (2); every other exact phrase occurs once.
- **no_progress**: no exact phrase repeated. Whole-function register allocation, relocation ownership, and cross-TU signatures recur as broader families.

## Surprises

- Three no-progress workers had only upstream timeout summaries, so their technique and loop-quality fields remain empty or unknown.
- `c9f70f07-808f-40b7-9499-864af58f6619` reached 100% with local externs, but review rejected the cross-TU declarations and the worker restored the compliant 98.47087% version.
- `d96e39af-39e8-4bc9-adb9-2c0bdb77c1e7` reports a byte-exact direct object in one summary even though the batch labels it a 99.52941% near-miss.
- Systematic loops dominate even among no-progress workers. The failures were usually compiler allocation or ownership constraints, not undiagnosed variant spam.
