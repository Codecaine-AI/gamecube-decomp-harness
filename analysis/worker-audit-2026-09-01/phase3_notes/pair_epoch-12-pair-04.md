## Verdict

The exact worker's key process advantage was testing a semantics-empty liveness constraint after diagnosing a register-coloring swap. Its empty `if (gobj != NULL) {}` kept `gobj` live long enough to flip MWCC's r28/r29 allocation without disturbing the schedule. The near-miss worker diagnosed its f0/f1 swap at least as deeply and ran far more experiments, but concentrated on expression, local, helper, type, stack, and ordering shapes; variants that fixed ownership disrupted scheduling, and it never found an equivalent no-op lifetime-only lever. Process explains the exact result only partially because the control's remaining constraint was demonstrably harder: allocation and five scheduling pairs had to stay correct together.

## Exact worker: how the gap was closed

- **Diff-reading style:** Instruction-level first, then targeted source experiments. The opening diff isolated a function-wide r28/r29 swap, and the worker explicitly wrote, "**Analyzing r28/r29 register swap in assembly**". Later it moved to "**Applying empty if for scoring test**" rather than continuing arbitrary rewrites.
- **The decisive move:** `checkdiff` showed `gobj` and the callback/data base colored into the wrong persistent registers. Regflow diagnostics, object disassembly, and allocator snapshots focused the hypothesis on liveness and coloring. Parameter reorders, aliases, wrappers, accessors, and local placement were neutral or worse. Adding an empty null test immediately before the route block made four consecutive checks reach 100%. Merging the null test with the route condition or hoisting a root local regressed, confirming that the separate empty test was the needed source shape. The retained `MUST_MATCH` comment states that it "keeps @c gobj live through route setup".
- **Tool rhythm:** Inspect/search/debug, then edit -> full `checkdiff` -> revert or refine. There were about 21 edit calls and 23 checkdiff calls. Pivotal tools were full instruction diffs, MWCC regflow diagnostics, allocator snapshots, and object disassembly. A 2,500-iteration permuter run and mutation previews did not solve it. Past-PR, graph, ledger, and knowledge searches supplied context, not the final code.

## Near-miss worker: why it stalled

- The remaining code mismatch was precise: the target assigned `frame_speed_mul` to f1 and item X to f0, while the candidate assigned them to f0 and f1, also swapping dependent `fdivs`/`fsubs` operands. It tried more than 100 source shapes across helper signatures, expression forms, local scope/order, copies, types, accessors, container/stack layouts, and statement scheduling, plus six permuter runs. It never produced or isolated a semantics-empty use that changed only the two values' live ranges, the exact worker's successful pattern.
- The stall was diagnosable, and the worker neither misread nor ignored it: "A distinct X-coordinate local or direct X expression produces the desired register ownership and matching fdivs/fsubs operands, but reorders the independent interpolation and throw-speed chains and falls to 94.47445%." Allocator captures later confirmed the virtual-register assignments. The unsolved problem was preserving schedule after fixing ownership.
- **Loop quality:** Mixed. Diagnosis was specific and systematic, but roughly 208 edits and 203 checkdiff calls became repetitive, with duplicate checks and many low-yield variants. It restored baseline after regressions and retained no bad edit.

## Transferable technique

- When a near-match is a persistent-register swap, map each mismatched physical register to its source value and inspect allocator live ranges before changing semantics.
- When the desired register ownership is known, test a separate semantics-empty use of the affected value at the boundary where its lifetime must extend; validate that it changes coloring without changing control flow or scheduling.
- After a source form fixes register ownership, compare instruction scheduling separately. Reject it if independent loads or arithmetic move, even when the focal operands now match.
- After a surprising exact match, falsify the explanation with nearby variants, then run repeated target checks and neighboring-function/TU validation before retaining a guarded `MUST_MATCH` tactic.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, scheduling-reasoning, type-shape-experiments, permuter, past-pr-lookup, inline-hypothesis
