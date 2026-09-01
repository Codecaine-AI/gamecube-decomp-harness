# Worker Audit Phase 2, Batch 06

## Batch Shape

80 workers: 1 exact, 15 near-miss, 20 progressed, 44 no-progress.

## Technique Counts by Cohort

- Exact: `float-literal-tricks` 1.
- Near-miss: `asm-diff-instruction-level` 13, `declaration-order-experiments` 9, `compiler-regflow-diagnostics` 7, `permuter` 7, `register-allocation-reasoning` 7, `checkpoint-restore` 6, `loop-restructure` 3, `type-shape-experiments` 3; six techniques occurred twice and 32 occurred once.
- Progressed: `asm-diff-instruction-level` 16, `register-allocation-reasoning` 11, `declaration-order-experiments` 10, `permuter` 8, `type-shape-experiments` 7, `loop-restructure` 6, `stack-layout-diagnostics` 6, `inline-hypothesis` 5, `compiler-regflow-diagnostics` 4, `inline-helper-extraction` 4, `lifetime-experiments` 4; five techniques occurred twice and 23 occurred once.
- No-progress: `asm-diff-instruction-level` 42, `register-allocation-reasoning` 34, `declaration-order-experiments` 30, `permuter` 30, `compiler-regflow-diagnostics` 15, `ledger-lookup` 15, `type-shape-experiments` 15, `lifetime-experiments` 11, `related-function-lookup` 10, `allocator-snapshot` 9, `checkpoint-restore` 9, `stack-layout-diagnostics` 9, `historical-source-lookup` 8, `inline-hypothesis` 8, `loop-restructure` 7, `past-pr-lookup` 7, `pointer-alias-experiments` 7, `helper-boundary-experiments` 5; nine techniques occurred two or three times and 44 occurred once.

Counts are worker occurrences, not attempt counts. Equivalent agent wording was normalized to reusable slugs before counting.

## Exact Worker Accounts

Only one exact worker appears in this batch, so there are not three accounts to report.

`314aa899-fb04-4f5f-8b6b-c4ac172a244b`: The worker corrected a mistyped float sentinel to `-F32_MAX`. That one change restored the intended value and the correct `.sdata2` reference, closing the match.

## Most Common Stall Reason

- Exact: none; the sole worker matched.
- Near-miss: no phrase repeated. The accounts were dominated by register allocation, relocation identity, and data-layout edge cases.
- Progressed: no phrase repeated. Register allocation or stack layout appears in 15 of the 20 worker-specific phrases.
- No-progress: `runner cannot execute 32-bit wibo` occurred twice. Several equivalent runner failures used different wording, so toolchain validation failure was more common than this literal count suggests.

## Surprises

- One no-progress `extab` worker reported that direct section comparison was already byte-exact; the failure came from scoring a data section as a function symbol.
- One worker briefly reached exact code by removing in-translation-unit definitions, but restored the lower-scoring source because the change broke BSS ownership and QA rules.
- Large permuter sweeps often confirmed local maxima. Several workers searched 1,000 or more candidates after reducing the diff to register operands, with no gain.
