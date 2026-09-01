# Worker-Audit Phase 2, Batch 12

## Batch Shape

- 80 workers: 6 exact, 29 near-miss, 31 progressed, 14 no-progress.
- Loop quality: 69 systematic, 8 mixed, 3 unknown.

## Technique Counts by Cohort

Counts below are worker occurrences. Slugs used by only one worker are grouped as `other` to keep the sweep readable.

- Exact: `asm-diff-instruction-level` 5; `inline-hypothesis` 4; `local-lifetime-scoping` 4; `permuter` 3; `loop-restructure`, `register-allocation-reasoning`, and `type-shape-experiments` 2 each; other 17.
- Near-miss: `permuter` 22; `local-lifetime-scoping` 21; `asm-diff-instruction-level` and `register-allocation-reasoning` 20 each; `type-shape-experiments` 15; `inline-hypothesis` 13; `declaration-order-experiments` 12; `checkpoint-restore` 10; `allocator-diagnostics` 9; `loop-restructure` 7; `past-pr-lookup` and `stack-padding-tuning` 5 each; `helper-boundary-experiments` and `pointer-alias-experiments` 4 each; `control-flow-restructure` and `stack-layout-tuning` 3 each; `data-layout-reordering`, `expression-reassociation`, `expression-shape-experiments`, and `relocation-analysis` 2 each; other 33.
- Progressed: `register-allocation-reasoning` 24; `permuter` 22; `asm-diff-instruction-level` 19; `local-lifetime-scoping` 18; `inline-hypothesis` 17; `declaration-order-experiments` 12; `type-shape-experiments` 11; `loop-restructure` 10; `checkpoint-restore` 9; `allocator-diagnostics`, `expression-reassociation`, `stack-padding-tuning`, and `typed-accessor` 4 each; `pointer-induction` and `stack-layout-tuning` 3 each; seven techniques occurred twice; other 19.
- No-progress: `permuter` 12; `asm-diff-instruction-level` and `type-shape-experiments` 11 each; `register-allocation-reasoning` 10; `allocator-diagnostics` 9; `declaration-order-experiments` and `local-lifetime-scoping` 8 each; `loop-restructure` 7; `checkpoint-restore` 6; `helper-boundary-experiments`, `inline-hypothesis`, and `past-pr-lookup` 5 each; `matched-analog-lookup` 4; `stack-layout-tuning` and `stack-padding-tuning` 3 each; `global-address-expression-experiments` 2; other 13.

## Three Exact Accounts

- `62602f7e-346f-4cd8-85de-e731c4fd2be6`: The worker isolated a six-operand r24/r25 swap before changing the loop to a single `i * 3 + 0x14` counter. Typed `user_data` access and a `PAD_STACK` increase from 0x10 to 0x18 closed the remaining gap.
- `72f8107d-db81-4c25-99e5-29efe6519b11`: One stale `u8` return declaration caused MWCC to insert a `clrlwi`. Removing that exposure and adding explicit conversions at narrow neighboring callers reached exact without breaking the already-exact neighbor.
- `89cb4a5f-3f0e-4b65-8d57-269d6a712018`: Thousands of permutations failed on one case-3 scheduling difference. Removing artificial temporaries and placing the arithmetic directly at the call site produced the target order.

## Common Stall Reasons

- Exact: none. All six accounts identify a closing factor.
- Near-miss: register allocation or register coloring, often coupled to stack slots or frame size, dominates 21 of 29 accounts.
- Progressed: register allocation, often coupled to stack layout or pointer materialization, dominates 26 of 31 accounts.
- No-progress: register allocation or coloring dominates 11 of 14 accounts; two others contain only worker/provider launch failures.

## Surprises

- Several workers found a measured 100% probe but reverted it because it required an out-of-scope header edit, damaged neighboring functions, or used prohibited data-order and assertion tricks.
- `55a57f86-cdf4-4a90-b753-1e217ab5e6ea` reports a manual qemu-verified 100% match in a later summary even though the batch row remains no-progress at 96.44444%; the record preserves that conflict rather than treating it as an exact result.
- Workers repeatedly rejected higher-scoring candidates when they changed semantics or looked like matching-only source. Score maximization was not their only acceptance rule.
