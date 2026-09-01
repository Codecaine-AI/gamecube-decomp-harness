## Verdict

The exact worker made the diff progressively smaller, then changed strategy when the residue became structural: it used instruction and object-level evidence to isolate the final scaling loop and one `f64` temporary, rewrote those exact source shapes, and reached 100%. The near-miss worker correctly recognized stack-slot and register-allocation trouble, but kept making loosely targeted declaration, cache, helper, padding, and expression experiments across a large function. Its best move, removing cached `arg3_x` and `arg3_y`, was evidence-based, but it stopped before turning the remaining initial `Vec3` stack-copy mismatches into a similarly narrow, exhaustive source-shape search. Process explains much of the outcome, though the collision target's size and intertwined lifetimes made the last gap harder.

## Exact worker: how the gap was closed

- Diff-reading style: mostly instruction-level and register-allocation reasoning, backed by candidate/target disassembly, allocator snapshots, and custom byte-comparison scripts. It did run source variants and the permuter, but increasingly constrained them from the diff. Telling lines are: "**Mapping semantic variables to targets**" and "**Analyzing final loop assembly differences**".
- The decisive move: narrowing two floating temporaries to their owning transform loops and reordering the paired `0.707107` calculations lifted the score to 98.48703%, leaving almost only the final shift loop. Replacing the generated 16-operation block with a natural 64-element loop, then removing the redundant `work_r3` pointer, jumped to 99.71182%. The last diff was the stack frame caused by a scoped `f64 scratch_f30_5`; inlining its expression into `work_r4_2[56]` removed that intermediate and immediately produced `PASS (100.00000%)`.
- Tool rhythm: roughly 25 to 35 edit -> `checkdiff_run` loops, with immediate reverts on regressions. Pivotal tools were full diffs, direct TU compilation plus `objdump`, MWCC allocation/regflow data, custom exhaustive declaration/statement/loop-shape scripts, and the source permuter. Past-PR, ledger, graph, and knowledge searches supplied analogies but did not deliver the final source.

## Near-miss worker: why it stalled

- It got stuck on the two opening `Vec3` temporary stack-slot mappings, later floating-point allocation around `offset_delta_x`, and their downstream register effects. It tried `PAD_STACK` sizes and placement, local scopes, declaration order, cached versus direct component loads, helper inlining, `Vec3` aggregation, dot-product order, split division, allocator snapshots, disassembly, and two permuter runs. It never performed the exact worker's bounded exhaustive search over the few remaining copy/initialization shapes or remove-and-inline experiments aimed specifically at the live temporary that controlled the frame.
- The stall was diagnosable from its own diff. The same first lines, such as `stw r3, 0x28(r1)` and adjacent stack loads/stores, survived most experiments. The worker eventually stated the evidence accurately: "The focused diff is now dominated by the two initial Vec3 temporary stack-slot mappings". It did not convert that diagnosis into a small search space before stopping.
- Loop quality: mixed. Many changes were isolated and checked promptly, and the direct-field experiment found a real improvement. But long stretches cycled through padding, scopes, helper forms, aggregate locals, and arithmetic ordering that repeatedly returned to 98.62579% or regressed, without freezing the unchanged mismatch cluster and narrowing the next hypothesis.

## Transferable technique

- When a full diff collapses to one region, stop broad declaration churn. Disassemble candidate and target around that region and name the source value represented by each differing register or stack slot.
- When the residue is a loop-shape mismatch, enumerate bounded `for`, `while`, `do`, pointer, index, and counter-reuse forms with a script, score their instruction bytes, and test only the best shape in the source.
- When prologue and stack offsets become the remaining mismatch, remove or inline one live temporary at a time, especially scoped `f64` intermediates and redundant pointers, then re-run the full diff.
- Revert every regression immediately and preserve the best checkpoint before trying a new variable lifetime, operand order, cache, or aggregate type shape.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, loop-restructure, checkpoint-restore, stack-frame-reasoning
