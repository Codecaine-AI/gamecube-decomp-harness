## Verdict

The exact worker's main advantage was turning a register-only diff into a concrete lifetime/coalescing hypothesis, then composing and ablating the required source cues. An analogous matched function had shown that `(void)` reads could steer MWCC FPR allocation; the worker combined those lifetime anchors with explicit destructive reuse of `base_y`. The near-miss also diagnosed its r3/r4 allocator mismatch correctly and searched far more variants, so this is only a partial process explanation: its systematic search never found a source-level affinity for r4 that preserved the surrounding exact code.

## Exact worker: how the gap was closed

- **Diff-reading style.** Instruction-level first, targeted source experiments second. It wrote, "Only two operand mismatches remain: reference uses fmadds f30, f30, f1, f0 and stfs f30, 0x3c(r27), while the candidate uses f29 as the destination/store register." Later it sharpened this to, "The candidate still places the computed cursor Y value in f29 instead of destructively reusing spacing in f30."
- **The decisive move.** `graph_related_functions` and `ledger_search` surfaced a matched `mnStageSw_80236548` case where `(void)` reads changed FPR liveness. Probes then showed that `base_y = spacing` moved the calculation toward destructive f30 reuse but disturbed other FPR assignments. The exact combination was to compute final Y through `base_y` after copying `spacing` into it, while retaining `(void)` anchors for `spacing`, `temp_x`, computed `base_y`, and `temp_z`. This produced 100%. One-at-a-time removals proved causality: removing those anchors yielded 99.89247%, 99.92831%, the original 99.96416%, and an isolated Z-register mismatch, respectively.
- **Tool rhythm.** Roughly 35-45 distinct edit -> full `checkdiff_run` probes, with 86 checkdiff calls including repeated verification, followed by ablation, direct compile, neighbor checks, lint, and `git diff --check`. Pivotal tools were full asm diff/objdump, related-function and ledger searches, and MWCC regflow/allocator snapshots. Past-PR and knowledge searches were not decisive. Two permuter attempts failed to locate the function and did not contribute.

## Near-miss worker: why it stalled

- It isolated the remaining code-byte issue to retail `lwz r4, 0x58(r1); clrlwi r28, r4, 16` versus the same operations through r3 after `grPushOn_80219204`. It tried declaration order and scope, types and casts, expression and assignment forms, arrays/structs/unions, aliases, stack layouts, prototype/return hypotheses, control-flow changes, inline/helper boundaries, allocator inspection, and multiple large permuter searches. None created r4 affinity without new instructions or other mismatches.
- The stall was diagnosable, and the worker read it correctly: "The remaining code mismatch is still isolated to the post-grPushOn_80219204 coin load and truncation. Retail uses r4 while the current build uses r3; surrounding scheduling, stack offsets, and instructions match." It further found that the virtual register had no r3-colored interfering neighbor, indicating allocator preference rather than a live-register conflict.
- What it never found was the exact worker's kind of productive lifetime/coalescing construction: a specific value reuse plus precisely placed no-op lifetime anchors that changed only the desired allocation. This was not an obvious omitted tool or ignored clue. It tried analogous type-shape, inline, allocator, history, and permuter tactics exhaustively, but no intermediate improved on baseline.
- **Loop quality.** Systematic. It used 46 checkdiff calls plus scripted grids containing hundreds of candidates, inspected generated asm/PCode, and restored every regression. The breadth became expensive, but it was organized hypothesis testing rather than shotgun mutation.

## Transferable technique

- When a diff differs only by an instruction register, map each register to its live source value and test allocator lifetime or coalescing hypotheses before changing control flow.
- Search matched analogous functions for compiler-steering idioms such as `(void)` lifetime reads, then verify the idiom against the local instruction window.
- To induce destructive register reuse, copy the long-lived input into the desired result variable before the expression and place no-op reads at exact lifetime boundaries for neighboring values.
- After reaching exact, remove each compiler-steering cue one at a time and record the resulting register diff; retain only cues with demonstrated effects.

## Flags

- exact_loop: mixed
- control_loop: systematic
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, type-shape-experiments, scheduling-reasoning
