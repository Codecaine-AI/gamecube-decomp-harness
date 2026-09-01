## Verdict

The most important process difference was that the exact worker turned its late register-diff evidence into one coherent source-shape hypothesis, removing both explicit induction variables so MWCC could recreate the target flow. The near-miss also read assembly carefully and solved its remaining instruction-shape mismatch, but its final gap was a correctly diagnosed relocation and translation-unit constant-pool issue whose direct fix lay outside its write set. Process therefore explains the exact worker's finish only partially; the control faced a harder ownership boundary, although its long float-expression search was less focused.

## Exact worker: how the gap was closed

- **Diff-reading style:** Mixed, but instruction-level when it mattered. It compared target and candidate disassembly, used allocator snapshots, and tracked register operands rather than relying only on score. Its reasoning explicitly says, `**Analyzing register assignment mismatch**` and later `**Refining row and cur_x register swapping**`. The middle still contained many guess-and-check declaration, type, alias, and helper variants.
- **The decisive move:** Removing `cur_row` and deriving the outer coordinate as `row + r` raised the match to 99.38356%. The remaining diff named r30/r31 operand mismatches, which directed attention to `cur_x`. Removing `cur_x`, looping only on `c`, and spelling the glyph coordinate as `x + c * 11` immediately produced 100%. The final explanation was accurate: `Matched hsd_80394544 exactly by restoring index-derived coordinates: row + r for the outer loop and x + c * 11 for each glyph.`
- **Tool rhythm:** Roughly 29 edits and 24 checkdiff runs, usually edit -> full checkdiff -> revert or refine. Early searches covered graph/ledger, past PRs, asm windows, knowledge, and git history; target/current objdump and repeated `mwcc_alloc_snapshot` calls were the useful evidence. A mutation preview was used, but no permuter run supplied the solution.

## Near-miss worker: why it stalled

- It first fixed frame/register and sphere-magnitude code shape through typed repeated command-list accesses, local-scope changes, ternary/matrix reshaping, and direct `sqrtf` expressions. The last jump to focused 99.83009% restored the reference 0x670-byte size. It then remained stuck on `psNumCmdList` versus target `psCmdListArray` relocations and `.sdata2` constant-symbol offsets.
- It never tested the direct owning-header fix it had itself specified, `extern HSD_PSCmdList** psCmdListArray[65];`, because `particle.h` was outside the write set. It also never changed the other unmatched function controlling constant-pool order. Unlike the exact worker, there was no remaining in-scope induction-variable simplification suggested by the final diff.
- The stall was diagnosable and was not misread. Checkdiff repeatedly named `lis r3, psCmdListArray@ha`, and readelf proved target `psCmdListArray` versus candidate `psNumCmdList`. Its final statement was precise: `The retained function now has the reference instruction sequence; remaining differences are relocation/data-pool operands.`
- **Loop quality:** Mixed. Assembly, relocation, frame, and register analysis was systematic and changes were score-gated with neighbor checks. The extended sequence of nearly equivalent float expressions, duplicate calls, low-yield permuter runs, and repeated unchanged scores became guess-and-check.

## Transferable technique

- When a diff shows widespread source-register swaps, compare allocator snapshots and remove redundant local induction variables; express coordinates from loop indices so the compiler can recreate the target induction flow.
- After one loop rewrite sharply improves the score, read the few remaining register operands before changing unrelated declarations or types; use them to identify the next live variable to eliminate or reshape.
- When code bytes align but relocation operands differ, inspect object relocations and symbol declarations directly; test the owning-header declaration before continuing expression permutations, or issue a scope request immediately if that file is unavailable.
- For inlined math mismatches, test direct expression trees and verify function size plus neighboring functions; retain a helper extraction only if it improves the target without changing another function's inlining.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, loop-restructure, checkpoint-restore, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning
