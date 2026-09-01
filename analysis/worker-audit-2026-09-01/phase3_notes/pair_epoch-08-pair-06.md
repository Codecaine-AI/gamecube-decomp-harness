## Verdict

The exact worker's main advantage was that it eventually stopped treating a register-only diff as a collection of local allocation accidents and reconstructed the likely authored abstraction boundaries from already-matched animation traversals. Its MObj, PObj, RObj, DObj, and recursive JObj inline-helper structure made MWCC allocate the whole function correctly at once. The near-miss worker found the same class of idea late, extracting one visibility-count helper for a large gain, but then returned to isolated stack, type, constant, and scheduling experiments. Process explains a meaningful part of the outcome, though the control's remaining prototype and translation-unit data-ownership mismatches also required changes outside the immediate function.

## Exact worker: how the gap was closed

- **Diff-reading style:** Mixed, but grounded in instruction evidence. It established that "The current and target functions remain opcode-identical at 0x304 bytes; all 24 differences are register operands." It then used allocator snapshots and reference/candidate objdump output to map variable lifetimes and register coloring, while also testing source shapes.
- **The decisive move:** After local alias, parameter-order, mask-local, wrapper-expansion, helper-extraction, mutation-preview, and 2,000-candidate permuter attempts failed, it inspected the exact baselib animation analogs and rebuilt the traversal hierarchy as focused inline MObj/PObj/RObj helpers, canonical DObj traversal, and natural recursive JObj traversal. The next check was 100%. Its own summary is precise: "Matched grAnime_801C7228 exactly by restoring the authored traversal-helper structure used by the solved baselib animation analogs." It then added call barriers so those new inline boundaries did not regress exact neighbor `grAnime_801C752C`.
- **Tool rhythm:** About 36 target `checkdiff_run` calls across 59 edits, with immediate reverts after large regressions, interrupted by longer evidence passes. Pivotal tools were reference/candidate objdump, `mwcc_alloc_snapshot`, baselib source inspection, git history, past-PR/knowledge searches, and final neighbor summaries. The permuter and mutation previews did not find the solution.

## Near-miss worker: why it stalled

- It ended with stack-slot offsets for JObj arrays/scoped indices, an `s8` prototype-driven conversion at `mn_80230D18`, `.sdata2` relocation ownership, and swapped induction-pointer increments. It tried declaration order, unions, padding, pointer-increment placement, local constant definitions/order helpers, explicit frame pointers, casts, and a 500-iteration permuter. It never followed the exact worker's full playbook of finding a matched structural analog and rebuilding all related abstraction boundaries together; nor did it change the owning header/prototype that its own analysis identified.
- The stall was partly diagnosable. It explicitly wrote, "The reference call passes arg0 with addi r5,r16,0, while the current s8 prototype forces extsb r5,r16." It did not ignore that evidence, but declared the truthful fix to belong in the owning header and left it unresolved. Other residual stack/scheduling differences were identified but not reduced to one proven source structure.
- **Loop quality:** Mixed. It used instruction-level hypotheses, direct disassembly, score checks, and disciplined reverts, but spent many cycles on speculative stack, declaration, and `.sdata2` variants even after stack diagnostics said frame mismatch was not the useful next mode. Its best move came late: a past-PR/knowledge clue led to `mn_80230E38_CountVisible`, moving the official score to 99.700584.

## Transferable technique

- When a diff is opcode-identical and differs only in registers, inspect matched sibling implementations for the original inline-helper boundaries before enumerating more local aliases or declarations.
- Use allocator snapshots and paired objdump output to map each mismatched register to a source lifetime, then test one lifetime/interference hypothesis per edit and revert regressions immediately.
- When duplicated loops have the same reference initialization shape, extract the likely authored static-inline helper and recheck both register copies and stack-frame size.
- When the diff proves a callee prototype forces an unwanted conversion, fix the owning declaration instead of trying casts or local call shims; validate neighboring functions after any inline-boundary change.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, inline-hypothesis, past-pr-lookup, permuter, type-shape-experiments, stack-frame-reasoning, scheduling-reasoning, checkpoint-restore
