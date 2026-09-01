# Batch 18 Self-Summary Audit

## Batch Composition

- 80 workers: 16 exact, 29 near-miss, 10 progressed, 25 no-progress.
- Three workers had no self-summary files: f8e6a774, a2038b77, and dc85f76d.

## Technique Counts by Cohort

Counts are workers mentioning the technique. The table shows the ten most frequent slugs per cohort; "other" is the number of additional distinct slugs.

| Cohort | Technique counts |
|---|---|
| exact | type-shape-experiments 5; section-byte-comparison 4; sibling-section-regression-check 4; checkpoint-restore 3; data-layout-reconstruction 3; constant-pool-ordering 3; alignment-control 3; section-byte-hash-validation 2; semantic-symbol-renaming 2; symbol-ordering 2; other 44 distinct |
| near_miss | permuter 25; asm-diff-instruction-level 24; register-allocation-reasoning 21; checkpoint-restore 21; declaration-order-experiments 15; type-shape-experiments 14; inline-hypothesis 11; helper-boundary-experiments 7; expression-shape-experiments 7; stack-layout-experiments 7; other 64 distinct |
| progressed | asm-diff-instruction-level 9; register-allocation-reasoning 8; permuter 7; checkpoint-restore 5; declaration-order-experiments 4; inline-hypothesis 4; local-lifetime-tuning 3; type-shape-experiments 2; loop-restructure 2; helper-boundary-experiments 2; other 32 distinct |
| no_progress | checkpoint-restore 18; permuter 17; asm-diff-instruction-level 17; register-allocation-reasoning 14; type-shape-experiments 12; loop-restructure 12; helper-boundary-experiments 8; declaration-order-experiments 7; inline-hypothesis 6; allocator-snapshot 4; other 68 distinct |

## Three Exact Accounts Worth Reading

- `fdbab6d8-b453-4322-bd67-f81f0656f6a1`: Reconstructed a 4,040-byte `.data` section with packed tables, camera data, descriptors, strings, and exact symbol order. Typed API overlays were preserved instead of replacing unknown structure with raw bytes.
- `34916e8b-3cb6-4a0b-875c-654dd1c8638b`: Removed `f` suffixes from two literals so MWCC promoted the decimal values before rounding. That tiny source change produced the exact target double bit patterns.
- `f541d8ee-a5eb-423e-b79b-74d77f759dcb`: Reversed bound order and scaled scoped temporaries in place, leaving uniform four-byte stack errors. Increasing `PAD_STACK(4)` to `PAD_STACK(8)` closed every remaining mismatch.

## Most Common Stall Reason by Cohort

- exact: none; all 16 accounts name a closing factor instead.
- near_miss: register-allocation or coalescing mismatches dominate, often coupled to stack slots or scheduling; exact stall phrases are mostly unique.
- progressed: register allocation dominates, with stack homes, lifetime, or scheduling as the recurring coupled constraint.
- no_progress: saved-register coloring and broader allocator coupling dominate; review or write-set constraints form a smaller second group.

## Surprise

The exact cohort is mostly data and constant-pool work, while near-misses are overwhelmingly allocator fights. Several non-exact workers demonstrated 100% diagnostic candidates but could not retain them because the needed header, symbol metadata, linkage, or review-gate change was outside the allowed solution. One no-progress record, `77f7e00f-d6fe-42ed-885d-66c49ca71526`, is internally inconsistent: its usable summaries claim a strict 100% match, but the TSV remains at 97.91282%.
