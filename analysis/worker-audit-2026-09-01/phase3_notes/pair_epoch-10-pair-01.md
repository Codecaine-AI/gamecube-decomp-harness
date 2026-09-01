## Verdict

The exact worker's decisive difference was that it eventually stopped treating the mismatch as a collection of local pointer/register accidents and changed the source model to express ownership: a typed one-byte order entry plus an inline helper that received both the order subarray and its owning runtime base/offset. That structural hypothesis made MWCC form the four full addresses exactly. The near-miss worker diagnosed its final one-instruction FPR problem precisely and searched far more variants, but remained within local expression, declaration, scope, padding, and scheduling perturbations. Process explains the outcome partially, not completely: both workers were persistent and used instruction-level evidence, but only the exact worker found a new source abstraction that resolved the allocator/addressing cause.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, but anchored in instruction operands. It explicitly concluded, "The residual mismatch is isolated to address decomposition in the four inlined matchup-order initializations" and later inspected the generated `addi r27,r30,128` plus the following loads/stores. Much of the middle was guess-and-check over casts, linkage, cursor loops, and struct layouts, but each family tested the full-offset versus split-BSS-base theory.
- The decisive move: the worker first established equal 336-instruction functions and localized 64 operand differences to four inlined order initialization/shuffle blocks. Typed overlays and pointer rewrites regressed. A later helper redesign introduced `gmClassicOrderIndex`, kept the selected order pointer, and also passed a typed runtime base plus `order_offset`. That preserved the adjacent BSS objects while inducing complete offsets `0x80`, `0x74`, `0x54`, and `0x2C`; the next checkdiff returned 100%.
- Tool rhythm: repeated edit -> full checkdiff -> inspect objdump/diff -> restore, roughly 30-40 validation iterations across two passes. Pivotal tools were full checkdiff, direct object disassembly, git history/blame, allocator/pcode capture, and a 600-iteration source-permuter run. Past-PR, graph, ledger, and knowledge searches supplied context but did not produce the fix.

## Near-miss worker: why it stalled

- It first got stuck on a 24-instruction FPR-coloring cascade beginning at `fsubs f2, f22, f23`. Scoped `u`/`l` bound temporaries, list-first operands, and reducing `PAD_STACK` from `0x10` to `4` collapsed that to one mismatch: the upper-bound multiply/comparison used `f2` instead of reference `f14`.
- It tried declaration permutations, scope/lifetime changes, arithmetic reassociation, temporary extraction, inline helpers, padding variants, self/copy assignments, hundreds of scripted candidates, several permuter runs, and custom FPR allocator captures. It never made the exact worker's kind of final structural move: redesigning the bound-calculation helper/interface or type model around the value owner after the one-register mismatch was isolated. Its helper experiments targeted the earlier relative-Y/sqrt expression and regressed before the final bound issue was found.
- The stall was diagnosable from its own output and was not ignored. Its final summary correctly says, "One FPR allocation/coalescing issue remains: the upper bound's halfRange multiplication and its first comparison use f2 instead of reference f14." The problem was hypothesis exhaustion, not a diff misread.
- Loop quality: mixed. The worker used disassembly, exact sibling comparison, object scoring, allocator snapshots, and ranked batch experiments systematically. It also generated many weakly motivated no-op, identity, copy, declaration, and arithmetic variants once the search reached the last register.

## Transferable technique

- When a diff has equal instruction counts but repeated address-operand mismatches, compare the base-plus-offset decomposition across every repeated block; model the owning object and subobject explicitly instead of tweaking each call independently.
- When an inline helper repeats the mismatch, change its parameter shape to expose both the selected subarray and the owning base/offset, then validate all inlined sites and neighboring functions.
- When a floating-register cascade remains, compare an exact sibling, capture allocator coloring, and batch-score tightly scoped declaration, lifetime, operand-order, and stack-padding variants; retain only authored-looking source that preserves frame size.
- After reducing a diff to one source register, state the exact producer and consumer instructions before further experiments, and switch to a new structural hypothesis when identity/copy permutations stop changing that allocation.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, stack-frame-reasoning, scheduling-reasoning, inline-hypothesis, checkpoint-restore
