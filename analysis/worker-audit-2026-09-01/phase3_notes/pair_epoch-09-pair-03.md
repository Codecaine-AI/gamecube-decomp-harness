## Verdict

The exact worker's main advantage was persistence at the compiler-artifact level: after source-shape and allocator experiments failed, it kept separating instruction/register mismatches from relocation identity and explicit pointer lifetimes until it found a source form that controlled all three. The near-miss worker also read the assembly and allocator evidence carefully, and it found a real improvement, but it stopped after shaping one live range and left the same diagnosed spacing-register problem unresolved. Process explains the outcome only partially because both workers were systematic in diagnosis and broad in experimentation; the exact worker's later relocation/type-overlay investigation was the meaningful extra step.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level first, followed by targeted source experiments. It explicitly mapped semantic values to physical registers: "Target disassembly requires lbl_804799D8 in r29, td1 in r30, and the default-path BracketEntry pointer in r31." Its reasoning also states, "Identifying register mapping cycle and reorder needs." This was not blind source permutation, although the long middle phase included many guess-and-check variants.
- The decisive move: typed `BracketEntry` indexing made the default-path bracket base persist in target `r31`. An explicit `lbl_804799D8` base pointer plus a separate `x48` field pointer then produced the target `r29/r28` lifetimes. The last gap was not an opcode mismatch but relocation naming: typed-global and `u32*` forms reached 99.97290% while relocating against `...bss.0`; a byte-base form emitted the named `lbl_804799D8` relocation and reached 100%. It then replaced the type-erasing casts with narrow typed overlay structs without losing the match.
- Tool rhythm: repeated edit -> `checkdiff_run` loops, well over 50 checks across the transcript, with periodic object disassembly/readelf and allocator snapshots. Pivotal tools were `mwcc_alloc_snapshot`, direct compile plus objdump/readelf, and full diffs. It also used several bounded permuter runs, including 1,000, 5,000, and helper-targeted searches, plus past-PR, ledger, graph, and knowledge searches; none directly found the winning edit.

## Near-miss worker: why it stalled

- It got stuck on late MWCC coloring around two JObj translation inlines. The column spacing references used candidate `r20/r21` instead of target `r19/r20`, while the row icon initially used `r22` instead of `r26`. It tried declaration order, dedicated JObj locals, chained assignments, expression splitting, scope/lifetime changes, inline helpers, type changes, no-op uses, allocator snapshots, history searches, and multiple permuter runs.
- A dedicated `row_jobj` was the retained improvement: it moved the row icon to target `r26` and raised the score to 99.68165%. The worker never carried the exact worker's successful playbook through to explicit typed views/base-field pointers or inspected relocation identity as another codegen constraint.
- The remaining stall was diagnosable from its own diff. Its final evidence says, "Residual mismatches are limited to spacing-reference register allocation: candidate r20/r21 versus target r19/r20, plus the existing column icon alias allocation." It did not misread that evidence; it exhausted many nearby source shapes, but stopped before finding a source-level lifetime split for those values.
- Loop quality: mixed. Diagnosis was systematic and experiments usually had a stated register/lifetime hypothesis, but many one-off aliases, declaration moves, no-op casts, and large score regressions made the search increasingly shotgun-like.

## Transferable technique

- When a diff preserves instruction order but rotates source registers, map each physical register to its semantic value, then use allocator snapshots to test explicit lifetime splits and typed aliases.
- After opcodes and registers appear correct, inspect object relocations with objdump/readelf; try source forms that preserve the required named symbol instead of accepting an anonymous section relocation.
- Introduce one dedicated local for a value that must survive across an inline expansion, then rebuild and confirm that the intended register moves without disturbing the frame or earlier allocations.
- Treat permuter and declaration-order sweeps as bounded searches. If they plateau, switch to explicit type shape, pointer lifetime, and field-view hypotheses derived from the remaining diff.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, inline-hypothesis, scheduling-reasoning
