# Worker-Audit Phase 2, Batch 15

## Batch Shape

- 80 workers: 9 exact, 34 near_miss, 26 progressed, 11 no_progress.

## Technique Counts by Cohort

- **exact:** asm-diff-instruction-level 9; gate-compliance-repair 8; register-allocation-reasoning 7; declaration-order-experiments 6; scope-lifetime-experiments 6; source-permuter 6; allocator-snapshot 5; inline-helper-recovery 5; historical-source-lookup 3; stack-frame-compensation 3; constant-pool-ordering 2; loop-restructure 2; type-shape-experiments 2; address-decomposition-reasoning, bitfield-rewrite, branch-local-temporaries, compiler-intrinsic, expression-shape-experiments, inline-hypothesis, loop-counter-reuse, nearby-solved-analog 1 each.
- **near_miss:** asm-diff-instruction-level 31; source-permuter 29; register-allocation-reasoning 26; allocator-snapshot 22; declaration-order-experiments 20; scope-lifetime-experiments 18; type-shape-experiments 14; expression-shape-experiments 11; inline-hypothesis 10; loop-restructure 10; gate-compliance-repair 9; inline-helper-recovery 9; historical-source-lookup 8; stack-slot-reasoning 8; constant-pool-ordering, cross-file-prototype-hypothesis, interference-graph-analysis 4 each; stack-frame-compensation, typed-pointer-alias 3 each; checkpoint-restore, manual-inline-expansion, pointer-to-indexed-access, relocation-diff-analysis, section-layout-reasoning, symbol-metadata-lookup 2 each; 15 other concrete techniques 1 each.
- **progressed:** register-allocation-reasoning 25; asm-diff-instruction-level 24; source-permuter 21; declaration-order-experiments 20; scope-lifetime-experiments 18; allocator-snapshot 12; expression-shape-experiments, loop-restructure, stack-slot-reasoning 10 each; type-shape-experiments 8; inline-hypothesis 7; gate-compliance-repair, inline-helper-recovery 5 each; historical-source-lookup, instruction-scheduling-reasoning 4 each; stack-frame-compensation 3; local-value-caching, pointer-iteration-experiments, pointer-reuse, symbol-metadata-lookup, typed-pointer-accessor, typed-pointer-alias 2 each; aggregate-data-reordering, constant-pool-ordering, cross-file-prototype-hypothesis, past-pr-lookup, temporary-elimination 1 each.
- **no_progress:** asm-diff-instruction-level, register-allocation-reasoning, source-permuter 10 each; allocator-snapshot, declaration-order-experiments 9 each; scope-lifetime-experiments 8; loop-restructure 6; type-shape-experiments 5; historical-source-lookup, inline-hypothesis 4 each; cross-file-prototype-hypothesis, inline-helper-recovery 3 each; instruction-scheduling-reasoning, interference-graph-analysis, manual-inline-expansion 2 each; bss-definition-ordering, checkpoint-restore, parameter-order-experiments, stack-frame-compensation, stack-slot-reasoning, symbol-visibility-experiments 1 each.

## Three Exact Accounts

**b9f6d5b5-af93-4755-adc4-6937b4811854:** Several 100% structures either regressed adjacent functions or needed forbidden pragma control. Two local inline helpers plus a natural indexed sibling loop finally made the target and neighbors exact with no added pragma.

**78e43e8f-d5b2-46d3-aff3-4a70f09f21ab:** The first exact bitfield fix used inline assembly and failed review. Replacing it with the established MWCC `__rlwinm` intrinsic preserved the live register, removed the redundant load, and kept 100%.

**d34938fe-5f73-4d71-9858-bc2b6ec5292d:** A typed one-byte matchup entry plus runtime-base and order-offset parameters reproduced all four complete-offset address forms. The match remained exact across all 12 same-unit functions and through a formatting-only gate repair.

## Most Common Stall Reason

- **exact:** none; exact records have no stall reason.
- **near_miss:** no repeated exact phrase; all 34 stall descriptions occur once, with register allocation dominating their substance.
- **progressed:** "second x1A88 pointer coalescing and stack slots" occurs twice; every other phrase occurs once.
- **no_progress:** no repeated exact phrase; all 11 stall descriptions occur once, mostly allocator or write-set barriers.

## Surprises

- Several cohort labels lag the self-summaries: c083ff42-a9aa-4ffa-926a-4d6495d29116 and ea5a9292-e857-4fb5-9523-92eec5fbfd5f report independently validated 100% forms despite near_miss labels.
- Exact cohort entries 6ebe7b5c-a53a-46c3-8735-37ece47e72a6 and 03cc7e73-bb52-47e4-b8f2-379145ba21df describe 100% probes that later hit hard-gate problems, showing that focused exactness and retainable exactness diverged.
- ffcc3917-0c31-4d06-8ef0-79b2a4bc1178 had no usable worker account at all, only a provider rejection and launch failure.
