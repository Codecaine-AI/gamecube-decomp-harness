## Verdict

The most important process difference was how each worker responded once the remaining diff was clearly a register-allocation problem. The exact worker stopped treating the loop statements as isolated expressions and tested a larger compiler-shaping hypothesis: move both related character-array loops behind one `static inline` boundary, then correct the resulting frame padding. That changed live ranges and produced 100%. The near-miss worker diagnosed its remaining register swaps correctly, but continued mostly with local declaration-order, type, scope, cast, and loop-form perturbations around an existing helper. It improved the score substantially but never found an equally effective change to the allocation boundary. Process explains part, not all, of the outcome: the near-miss function was much larger and its final register cycle was more coupled.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, but grounded in instruction and register evidence. It repeatedly tracked pointer registers, live ranges, stack size, and allocator effects rather than relying only on scores. Two telling reasoning lines are: "Analyzing allocator impact on register coloring" and "Planning static inline helper test".
- The decisive move: first it converted the three `chars` initializations to a counted loop and reduced `PAD_STACK` from 16 to 8, reaching roughly 99.3%. A helper containing only that initialization regressed slightly. It then expanded the helper signature to accept `chars`, `opp_data`, and `round`, and moved both the initialization loop and opponent-character population loop into it. The next `checkdiff_run` returned 100%. It kept the boundary, renamed it to the same-file `gm_801B5624_inline` convention, and verified that `PAD_STACK(8)` preserved the target 0x80-byte frame.
- Tool rhythm: inspect full diff and disassembly, edit one structural variable, run full `checkdiff`, then revert or retain. There were roughly 20 edit/check cycles, including several large regressions that were restored. Pivotal tools were `objdump`/assembly reads, register and stack diagnostics, a source permuter run, git history and past-PR searches, and inspection of the nearby `gm_801B5ACC_inline` pattern. The permuter did not supply the winning edit.

## Near-miss worker: why it stalled

- It ended with the color-setup loop swapping the physical registers for `color_idx` and the inlined `num_colors`, plus a shifted caller-register set in the final boss-rules block. It tried declaration reordering, signedness and width changes, pointer versus indexed loops, `for` versus `do-while`, casts, variable scoping, helper parameter and source order, helper removal, a trivial identity helper, padding changes, allocator snapshots, and several permuter runs.
- What it never tried from the exact worker's successful playbook was a disciplined redesign of the remaining inline boundary followed by a frame-padding adjustment. Its existing `SetupColors` helper was repeatedly respelled, moved, expanded at the call site, or supplemented with tiny helpers, but it never found or systematically enumerated a larger grouping of coupled work that changed all relevant live ranges together.
- The stall was diagnosable from its own diff. Its final report states: "The color-setup loop still swaps the physical registers used for color_idx and the inlined num_colors value." It did not ignore that evidence, but after reaching 99.76073% it kept testing many source forms that repeatedly returned the identical register mismatch, instead of escalating to a bounded set of live-range or inline-boundary hypotheses.
- Loop quality: mixed. The early disassembly, allocator snapshots, history search, checkpoint restoration, and score tracking were systematic. The long tail became shotgun because many type, order, cast, and loop-form probes lacked a new prediction and reproduced the same diff.

## Transferable technique

- When a near-match consists mostly of source-register swaps, map each mismatched physical register to a source value and test changes to that value's lifetime, not just equivalent expression spellings.
- When repeated loops share locals and a stable register cycle survives local edits, test moving the coupled loops into one `static inline` helper with all live inputs as parameters; then recheck stack padding because inlining can change the frame.
- After every speculative edit, run a full instruction diff and immediately restore the best checkpoint when the frame or broad register map regresses.
- If several declaration, type, or loop-form variants reproduce the same diff, stop that family of probes and escalate to a structural hypothesis such as helper boundary, scope, or call-expression nesting.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, inline-hypothesis, stack-frame-reasoning, permuter, past-pr-lookup, type-shape-experiments, loop-restructure, checkpoint-restore
