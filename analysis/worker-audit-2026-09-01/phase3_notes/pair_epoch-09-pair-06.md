## Verdict

The exact worker's main advantage was that it turned an instruction-level register-allocation diagnosis into a sustained inline-boundary experiment. After the permuter produced a 99.75% helper-extraction candidate, it treated the helper shape as evidence, rebuilt that shape as plausible source, and tuned helper parameters and local declaration order until the register coloring matched. The near-miss worker also diagnosed register allocation and used stack-scope experiments, but its search remained split among stack slots, `.sdata2` relocations, volatile probes, helper shapes, and broad declaration permutations. Process explains part, not all, of the outcome: both workers were technically capable and similarly iterative, but only the exact worker found and fully exploited a strong structural lead.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, but grounded in specific instructions and registers rather than blind scoring. It explicitly summarized: "The mismatch is isolated to the first option-root construction loop: the reference assigns option_root to r31 and visible to r26, while the current source assigns them to r26 and r31." Its reasoning also named the task directly: "**Analyzing register mismatch in checkdiff**".
- The decisive move was extracting the option-root initialization loop into `mn_80230274_InitOptionRoots`. The chain was: checkdiff isolated an `r26`/`r31` coloring problem; direct expression, scope, type, loop, and pointer variants regressed; a permuter replay reached 99.75% by extracting a helper; a plausible hand-written inline helper raised the score through 99.83003%, 99.88669%, 99.90085%, and then 100%. The final flip came from changing helper-local declaration order from `option_root, visible, j` to `option_root, j, visible`, with a caller-owned `s32* i` preserving the outer loop counter's lifetime.
- Tool rhythm: roughly 35 to 45 edit -> `checkdiff_run` loops across two passes, with immediate restoration of most regressions. Pivotal tools were full checkdiff, reference/candidate objdump, allocator snapshots, permuter run/replay, past-PR and knowledge searches, and the analogous `mn_802327A4` source. Final verification used checkdiff summary, direct compile, lint, and `git diff --check`.

## Near-miss worker: why it stalled

- It got stuck after matching the 0xD8 frame and twelve JObj output stack slots. The remaining substantive difference was GPR coloring in the Up/Down page-position expansions, especially reference `r29` versus candidate `r27`, plus equivalent-value `.sdata2` relocation symbols. It tried branch-local lifetimes, distributed `PAD_STACK`, declaration and type order, aliases, direct field access, helper extraction, arrays, volatile locals, allocator snapshots, and three permuter runs.
- The stall was diagnosable from its own diff. It eventually stated: "The residual substantive mismatch is GPR coloring in the Up/Down page-position expansions." It did not ignore that evidence, but it failed to narrow the search around one promising structural candidate. The volatile probe reached 99.63088%, yet was correctly rejected as implausible. Unlike the exact playbook, it never took the volatile-induced lifetime/coloring change and recreated it through a small plausible inline helper plus systematic helper-local declaration-order enumeration.
- Loop quality: mixed. Stack-slot mapping and padding redistribution were systematic and measurably useful, but the later search became broad: helpers, aliases, arrays, volatile, page type/scoping, declaration order, relocation-order tooling, and repeated permuter runs without a single retained structural hypothesis. It did restore regressions and validate the final retained change.

## Transferable technique

- When a diff is dominated by source-register substitutions, map each live source value to the reference and candidate registers before editing; state the exact coloring conflict.
- When a permuter improves the score by extracting a block, treat the inline boundary as a hypothesis. Rebuild it as a plausible named helper, then test its parameters, caller-owned state, and local declaration order one variable at a time.
- After a helper improves the score, enumerate adjacent local declaration orders inside that helper; MWCC coloring can flip on a two-variable swap even when generated instructions and semantics are otherwise stable.
- Use stack-slot objdump traces to solve address-taken local layout first, then freeze that layout and separate relocation-only differences from remaining instruction/register differences.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, stack-frame-reasoning, inline-hypothesis, checkpoint-restore
