## Verdict

The exact worker's main advantage was not fewer guesses but a better escalation path: it turned the diff into a concrete allocator/stack-layout model, recovered a historically evidenced inline-helper boundary, and then searched declaration, parameter, volatile, and padding shapes around that model until the bytes matched. The near-miss worker also diagnosed its five instructions precisely, including the `extsb` forced by an `s8` prototype and a symmetric `r0`/`r3` allocator tie, but spent most of its effort cycling local source representations. It never performed the exact worker's decisive kind of structural recovery around a helper boundary, and it treated the owning-header fix as out of scope rather than resolving or escalating it to completion. Process explains the outcome partially: the control mismatch was genuinely constrained by a header outside its approved write set, but its local search became repetitive.

## Exact worker: how the gap was closed

- **Diff-reading style:** Mixed, with strong instruction-level analysis before source experiments. It extracted and aligned candidate/reference objdump output, mapped the remaining differences to an `r27`/`r29` swap, inspected MWCC coloring snapshots, and tracked frame offsets. Its reasoning explicitly says, "**Identifying register swap causing mismatches**" and later "**Analyzing register interference and desired color swaps**." It then used score-driven source-shape searches rather than blind semantic rewrites.
- **The decisive move:** It recovered a page-cursor inline-helper shape from history, passed branch-specific JObj output slots through that helper so stack ownership remained in the caller, and tuned the caller declaration shape. Parameter-order search reached 99.89597%, outer-local subset search reached 99.94631%, and the final matching-only volatile/declaration shape reached 99.99664%. Reducing `PAD_STACK` from `0x44` to `0x34` corrected the helper-induced frame and output-slot offsets and flipped the runner-policy score to 100%. Removal probes confirmed the otherwise-unused `tree` and `y_b` declarations were allocation constraints: removing them dropped the score to 99.94463% and 99.93456%.
- **Tool rhythm:** Initial graph, ledger, past-PR, history, and full-diff inspection; manual edit -> `checkdiff_run` loops; a 300-iteration permuter; MWCC allocator snapshots; then bounded scripts for helper parameter order, local order, and outer declaration subsets. Roughly dozens of edit/build/diff iterations followed, with frequent reverts of regressions. Final validation used direct compile, objdiff, neighboring-symbol summaries, lint, and `git diff --check`.

## Near-miss worker: why it stalled

- It was stuck on five instructions: expected `addi r5,r16,0` versus generated `extsb r5,r16` at the `mn_80230D18` call, plus two load/store pairs whose temporaries were colored `r0`/`r3` instead of target `r3`/`r0`. It tried scalar and aggregate forms, signedness, volatile, declaration and initialization order, pointer aliases, helpers, loop forms, stack padding/overlays, `memcpy`, historical variants, function-pointer casts, allocator snapshots, and several permuter runs totaling thousands of iterations.
- The stall was diagnosable from its own diff. It correctly wrote, "Expected addi r5,r16,0; generated extsb r5,r16," and proved the owning header's `s8` declaration forced the conversion. It also found allocator attempt 1 had the target `r3`/`r0` colors, while spill rewriting of v54/v56 made attempt 2 flip them. It did not ignore the evidence, but it did not turn the spill-rewrite observation into a narrow structural search comparable to the exact worker's recovered-helper and declaration-subset search.
- What it never tried from the exact playbook: recover or introduce a historically supported helper boundary specifically to reshape the spill/lifetime graph, then systematically search that helper's parameter order together with caller-only dummy/volatile declarations and compensate the stack frame. It tried isolated inline helpers, but treated their regressions as dead ends rather than a coupled helper-plus-frame problem. It also never completed the canonical header signature repair because widening was disabled.
- **Loop quality:** Mixed. Diagnosis and allocator inspection were systematic; the long sequence of overlapping union, scalar, volatile, pointer, initializer, loop, and padding variants became shotgun and repeatedly returned to baseline without a tighter hypothesis.

## Transferable technique

- When a near-exact diff is a register swap, align candidate and target instructions, map the registers to allocator virtual nodes, and inspect interference, simplify order, spill rewrites, and final coloring before editing source.
- Search historically evidenced helper or inline boundaries when a mismatch spans register allocation and stack slots; test helper parameter order, caller-owned output slots, declaration subsets, volatile qualifiers, and stack padding as one coupled shape.
- After reaching a better score, remove suspicious dummy locals one at a time and recompile. Keep only declarations whose removal measurably worsens the match, and guard matching-only forms with `MUST_MATCH` when needed.
- When an unwanted extension is forced by a callee prototype, verify it with a temporary signature probe. Fix the canonical owning declaration and definition, or explicitly escalate the write set; do not spend the remaining run on source-only casts that change a direct call into an indirect one.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning, checkpoint-restore
