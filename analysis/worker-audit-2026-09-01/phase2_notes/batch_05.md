# Worker-audit Phase 2, batch 05

80 workers: exact 2; near_miss 22; progressed 24; no_progress 32.

## Technique counts by cohort

### exact (2 workers)

`asm-diff-instruction-level` 1, `constness-experiment` 1, `data-relocation-analysis` 1, `float-literal-correction` 1, `packed-union-struct-modeling` 1, `qa-lint-repair` 1, `sdata2-relocation-reasoning` 1, `type-shape-experiments` 1, `whole-object-assignment` 1.

### near_miss (22 workers)

`asm-diff-instruction-level` 22, `permuter` 18, `register-allocation-reasoning` 15, `declaration-order-experiments` 13, `lifetime-scope-experiments` 12, `type-shape-experiments` 10, `past-attempt-lookup` 9, `checkpoint-restore` 7, `mwcc-debug-diagnostics` 5, `analog-function-lookup` 4, `inline-hypothesis` 4, `stack-layout-reasoning` 4, `stack-padding-experiments` 4, `mwcc-allocator-capture` 3, `allocator-pcode-analysis` 2, `expression-order-experiments` 2, `expression-shape-experiments` 2, `neighbor-regression-check` 2, `pointer-shape-experiments` 2, `addressing-shape-experiments` 1, `argument-reuse-experiments` 1, `assignment-in-condition` 1, `assignment-shape-experiments` 1, `bitmask-expression-restructure` 1, `bss-layout-analysis` 1, `control-flow-restructure` 1, `declaration-initialization-experiments` 1, `direct-compile-validation` 1, `float-literal-experiments` 1, `float-pool-layout-analysis` 1, `float-temporary-experiments` 1, `global-alias-experiments` 1, `graph-analog-lookup` 1, `infrastructure-diagnosis` 1, `initialization-order-experiments` 1, `inline-helper-parameterization` 1, `inline-parameter-order-experiments` 1, `instruction-scheduling-reasoning` 1, `linkage-experiments` 1, `local-copy-experiments` 1, `local-elimination` 1, `local-reuse-experiments` 1, `loop-restructure` 1, `object-disassembly` 1, `past-revision-lookup` 1, `past-solution-transfer` 1, `pointer-iteration-experiments` 1, `relocation-analysis` 1, `sdata2-order-analysis` 1, `sdata2-order-helper` 1, `sibling-function-lookup` 1, `temporary-local-experiments` 1.

### progressed (24 workers)

`asm-diff-instruction-level` 22, `register-allocation-reasoning` 11, `stack-layout-reasoning` 9, `declaration-order-experiments` 8, `lifetime-scope-experiments` 8, `permuter` 6, `stack-padding-experiments` 6, `checkpoint-restore` 5, `inline-hypothesis` 5, `pointer-shape-experiments` 5, `type-shape-experiments` 5, `mwcc-debug-diagnostics` 4, `past-attempt-lookup` 4, `neighbor-regression-check` 3, `past-revision-lookup` 3, `analog-function-lookup` 2, `comparison-reversal` 2, `control-flow-restructure` 2, `graph-analog-lookup` 2, `local-temporary-introduction` 2, `loop-restructure` 2, `loop-structure-preservation` 2, `bss-relocation-analysis` 1, `canonical-type-lookup` 1, `condition-shape-experiments` 1, `cross-file-symbol-analysis` 1, `declaration-initialization-split` 1, `expression-order-experiments` 1, `expression-rewrite` 1, `float-scheduling-reasoning` 1, `global-reload-experiments` 1, `helper-boundary-experiments` 1, `identifier-cleanup` 1, `integer-signedness-experiment` 1, `intermediate-local-experiments` 1, `linkage-experiment` 1, `operand-order-experiments` 1, `padding-removal` 1, `past-pr-lookup` 1, `pointer-arithmetic-removal` 1, `pointer-cast-field-access` 1, `pointer-construction-experiments` 1, `pointer-induction-shaping` 1, `predicate-shape-experiments` 1, `qa-gate-validation` 1, `register-lifetime-shaping` 1, `repository-history-lookup` 1, `same-unit-regression-repair` 1, `typed-field-access` 1, `volatile-experiments` 1.

### no_progress (32 workers)

`asm-diff-instruction-level` 30, `permuter` 25, `register-allocation-reasoning` 24, `declaration-order-experiments` 19, `past-attempt-lookup` 13, `type-shape-experiments` 11, `checkpoint-restore` 10, `lifetime-scope-experiments` 9, `inline-hypothesis` 8, `stack-layout-reasoning` 8, `mwcc-debug-diagnostics` 6, `pointer-shape-experiments` 5, `analog-function-lookup` 4, `graph-analog-lookup` 4, `helper-boundary-experiments` 4, `stack-padding-experiments` 4, `initialization-order-experiments` 3, `parameter-order-experiments` 3, `pointer-loop-restructure` 3, `toolchain-diagnosis` 3, `allocator-capture` 2, `allocator-pcode-analysis` 2, `control-flow-restructure` 2, `expression-order-experiments` 2, `linkage-experiments` 2, `loop-restructure` 2, `object-disassembly` 2, `past-pr-lookup` 2, `past-revision-lookup` 2, `pointer-initialization-experiments` 2, `qa-lint-validation` 2, `address-construction-experiments` 1, `array-indexing-restructure` 1, `assignment-shape-experiments` 1, `bss-relocation-analysis` 1, `codegen-neutral-renaming` 1, `cross-function-regression-check` 1, `data-order-experiments` 1, `direct-array-indexing` 1, `expression-shape-experiments` 1, `float-scheduling-reasoning` 1, `float-temporary-experiments` 1, `global-address-scheduling-reasoning` 1, `global-base-pointer-reuse` 1, `helper-structure-experiments` 1, `indexing-shape-experiments` 1, `inline-expansion` 1, `instruction-scheduling-analysis` 1, `linkage-shape-experiments` 1, `loop-counter-scope-experiments` 1, `loop-lowering-analysis` 1, `loop-splitting` 1, `memcpy-shape-experiment` 1, `mwcc-allocator-capture` 1, `objdump-comparison` 1, `output-pointer-experiment` 1, `owning-header-analysis` 1, `pointer-alias-experiments` 1, `pointer-caching` 1, `pointer-cast-experiments` 1, `pointer-lifetime-experiments` 1, `pointer-return-helper-experiment` 1, `qa-gate-validation` 1, `relocation-analysis` 1, `repository-history-lookup` 1, `section-layout-experiments` 1, `shared-temporary-experiments` 1, `storage-section-experiments` 1, `symbol-ownership-analysis` 1, `type-alias-experiment` 1, `typed-struct-overlay` 1, `volatile-probe` 1.

## Most interesting exact-worker accounts

Only two exact workers occur in this batch, so both are listed rather than inventing a third.

- `03b4be3b-f8f2-4115-80df-5693fea6803e`: Correcting both sentinel literals to `-3.4028235e38f` fixed the comparisons and their shared sdata2 relocation. This was a compact, diagnosis-driven literal/relocation win.

- `eec2b59b-f9c8-46d6-b09f-741cc13db1d6`: Packed typed objects plus whole-object assignments restored runtime loads and closed the recorded batch gap. Its final self-summary still described two conversion-constant relocations at 99.90741%, so the summaries lag the eventual 100% result.

## Most common stall reason per cohort

- exact: none (one worker reports no stall; the other summary still names compiler-local conversion-constant relocation).

- near_miss: register allocation/coalescing (13 of 22; usually one small operand cluster).

- progressed: register allocation or register pressure (17 of 24).

- no_progress: register allocation or register pressure (21 of 32).

## Surprises

- Several workers found score improvements or even 100% candidates that were rejected by QA, symbol-section ownership, write-set, or neighboring-function regression constraints.

- Toolchain failure was itself a recurring stall: multiple summaries could not execute the configured 32-bit `wibo`, while one worker recovered by invoking it through `qemu-i386`.

- The batch directories contained up to five `worker_*.txt` summaries per worker, more than the estimated one to three; all matching files were read.
