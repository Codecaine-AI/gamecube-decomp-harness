## Verdict

The exact worker's main advantage was that it eventually stopped treating the last displaced `stw` as a pure scheduling puzzle and challenged the source call shape itself. It removed two spurious variadic arguments, which eliminated the store and matched immediately. The near-miss worker did strong instruction-level diagnosis, but kept trying to coerce stack and register allocation through helpers, declarations, pointer forms, and loop rewrites. That process difference mattered, though target shape also mattered: the exact target had one displaced instruction, while the control had frame, array-placement, and signed-sort register differences spread through a 6 KB multi-case function.

## Exact worker: how the gap was closed

- Diff-reading style: mixed but anchored to the assembly. It identified the sole residual as `"left 2324: DIFF_DELETE stw r3, 0x6c(r1)"` and explicitly framed the task as `"Planning single store scheduling analysis"`. It then mixed targeted reasoning with many source-shape probes.
- The decisive move: after confirming there was no stack/frame mismatch, inspecting the call prototype and related name-menu code, and repeatedly finding that loop-variable, expression-order, declaration, helper, and permuter changes either did nothing or caused broad regressions, it removed `font_x, col_x` from the variadic tail of `HSD_SisLib_803A6B98`. The next checkdiff was 100%. Those arguments were unnecessary for the format call and had caused the extra stack store/scheduling displacement.
- Tool rhythm: initial read/search/diff and object/ASM inspection, then roughly 12 edit -> checkdiff experiments, usually reverting regressions to the 99.53162% checkpoint. Pivotal tools were full checkdiff, direct object disassembly, prototype/related-source search, allocator snapshot, and two bounded permuter runs, 500 then 2,000 iterations. The permuter did not find the win. Past-PR, ledger, graph, and knowledge searches supplied context but not the final edit.

## Near-miss worker: why it stalled

- It got stuck on a persistent 240-byte target frame versus 248-byte helper-based frame, case-local array offsets, and register assignments in signed sort loops. It tried stack padding removal, helper extraction and inlining, signed and unsigned helper types, pointer and pointer-to-pointer forms, declaration order, base-pointer timing, manual loop expansion, historical source, and scripted loop/register variants.
- It never made an exact-worker-style simplification pass over the source expressions and calls in the still-mismatching cases, asking whether an unnecessary argument, local, copy idiom, or abstraction created the allocator pressure. Its experiments mostly added or reshaped allocator inputs. It also never ran the source permuter, although it did build narrower custom variant scripts.
- The stall was diagnosable at the category level, not as one obvious source fix. Its own final diagnosis was accurate: `"Remaining differences are chiefly frame and case-local array placement plus register assignment around the signed sort paths."` It did not ignore the diff. The weakness was failing to turn that diagnosis into isolated, one-case hypotheses with a stable checkpoint and a mismatch map after each accepted change.
- Loop quality: mixed. The object comparison scripts, historical compilation, offset accounting, and reverts were systematic. The long sequence of helper signatures, pointer scopes, declaration orders, and multi-case edits became shotgun because several allocator variables changed together and local wins were hard to attribute.

## Transferable technique

- When only one instruction is inserted or displaced, inspect the source construct that can emit it and remove semantically unnecessary operands before trying broad register-allocation rewrites.
- After a stack/frame diagnostic says the frame matches, stop changing local layout. Focus on call shape and instruction scheduling around the exact diff address.
- For a large switch function, map each mismatch cluster to one case and vary one case at a time. Keep the best checkpoint so frame and register effects remain attributable.
- Use bounded permuter or scripted variants only after defining the exact local expression or loop to mutate, and reject variants that trade the target mismatch for broad prologue or cross-case changes.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, scheduling-reasoning, stack-frame-reasoning, register-allocation-reasoning, type-shape-experiments, inline-hypothesis, loop-restructure, checkpoint-restore, permuter, past-pr-lookup
