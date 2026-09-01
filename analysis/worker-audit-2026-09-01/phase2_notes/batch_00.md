# Worker Audit Phase 2, Batch 00

Records: 80. Cohorts: near_miss 39, no_progress 41, exact 0, progressed 0.

## Technique Counts by Cohort

- exact: none
- near_miss: `asm-diff-validation` 25, `review-lint` 5, `asm-diff-instruction-level` 3, `code-shape-review` 2, `inline-hypothesis` 2, `relocation-diff-analysis` 2, `sdata2-order-experiments` 2, `checkpoint-lookup` 1, `checkpoint-restore` 1, `dependency-graph-review` 1, `expression-shape-review` 1, `float-literal-tricks` 1, `past-pr-lookup` 1, `target-ledger-lookup` 1, `translation-unit-compile-repair` 1, `type-shape-experiments` 1
- progressed: none
- no_progress: `asm-diff-validation` 2, `asm-diff-instruction-level` 1, `direct-tu-compile` 1, `git-history-lookup` 1, `inline-hypothesis` 1, `object-disassembly-comparison` 1, `split-config-lookup` 1, `translation-unit-ownership-trace` 1

## Exact-Worker Accounts

This batch contains no workers labeled `exact`, so there are no exact-worker accounts to rank.

## Most Common Stall Reason by Cohort

- exact: none recorded
- near_miss: canonical .sdata2 ownership and ordering (1)
- progressed: none recorded
- no_progress: sandbox could not execute 32-bit wibo (1)

## Surprises

- 50 of 80 artifact directories had no direct `worker_*.txt` summary, sharply limiting evidence for the latter half of the batch.
- The TSV labels 39 workers as `near_miss`, but many summaries say the checked-out source already validated at 100%. The report preserves the TSV cohort and treats this as provenance drift, not exact-worker success.
- Two near misses reached instruction parity but remained short of an acceptable match because small-data relocation ordering or symbol ownership differed.
