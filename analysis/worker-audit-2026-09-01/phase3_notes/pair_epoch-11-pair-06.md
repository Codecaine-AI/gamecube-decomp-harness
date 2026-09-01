## Verdict

No meaningful exact-versus-near-miss process difference can explain the reported outcomes, because the control transcript does not end as a near-miss. After two stalled, clean-revert handoffs at a tool-local 99.59507%, it continues and validates `grZebes_801D881C` at 100%. The main process contrast is speed and focus: the `.rodata` worker classified a section-placement problem and fixed it in one retained experiment, while the Zebes worker correctly diagnosed a six-instruction scheduling/register-allocation problem but spent many guess-and-check cycles before finding the source shape. The supplied final score of 99.98239% is therefore not explained by the transcript.

## Exact worker: how the gap was closed

- Diff-reading style: systematic section and symbol analysis, not instruction-level asm reasoning. It compared reference/current section tables, symbol bindings, relocations, and per-section objdiff scores. Its reasoning narrowed the cause to storage class: "Refining global symbol storage and const qualifiers" and later "Restoring static and adding const qualifier."
- The decisive move was changing `lbl_803B7A60` from `static struct` to `static const struct`, which moved its 0x70-byte zero initializer from `.data` to `.rodata`. The chain was: symbols.txt identified `.rodata` ownership and size; `nm` showed the reference symbol as read-only; relocations showed its consumers; objdiff showed `.rodata` at 54.098362%; the const-qualified candidate made that section 100%. Const-qualifying the use-site pointer was score-neutral for placement and was retained only for correctness.
- Tool rhythm: inspect broadly, make one substantive edit, direct-compile, inspect sections, score the candidate, simplify to the minimal header change, rebuild, and rescore. Roughly three compile/score validations surrounded one effective source experiment. Pivotal tools were `readelf`/`nm`/`objdump`, objdiff JSON, direct compile, past-PR search, knowledge/ledger search, and git history. No permuter was used.

## Near-miss worker: why it stalled

- It stalled twice on the same local sequence: reference loaded position zero into `f0`, loaded `5.0f` into `f1`, performed `fsubs`, loaded `-9999.0f` into `f0`, computed the array pointer, then stored; current code used `f1` for position zero, hoisted `-9999.0f`, delayed `5.0f`, and swapped `stfs`/`addi`. It tried expression splitting, literal forms, declaration order, chained stores, helper boundaries and signatures, loops, stack padding, direct versus typed access, aggregate layout, pointer stores, PCode inspection, and 1,200- then 4,000-iteration permuter runs.
- Nothing useful from the `.rodata` worker's playbook was left untried. Section/symbol inspection would not address this instruction-scheduling mismatch, and the Zebes worker already used object dumps, git/PR/knowledge searches, allocator snapshots, and candidate scoring. The transcript ultimately disproves the stall: a dedicated `init_heights` pointer plus six fixed `*init_heights++ = -9999.0f` stores produced the required FPR reuse, pointer setup, and store order, then passed checkdiff at 100%.
- The stall was diagnosable and was read correctly. Its handoff states: "The relevant PCode block confirms the mismatch is a local scheduling/order issue among the two constants, fsubs, first store, and pointer computation." The weakness was search discipline after diagnosis: many nearly redundant edits and duplicate checkdiff calls made the loop mixed, sometimes shotgun. The final phase became systematic when it followed the pointer identity and post-increment evidence, checked stack-frame regressions, and retained the exact form.

## Transferable technique

- Classify a low-scoring data target before editing: compare reference/current section sizes, symbol bindings, relocations, and per-section objdiff data, then change the owning definition's storage class rather than a use-site pointer type.
- When the remaining diff is only FPR choice and independent-instruction order, write down the exact reference/current instruction sequences and change source dependencies or pointer identity to constrain MWCC scheduling.
- For repeated fixed-size stores, test a separate initialized pointer with explicit post-increment stores; verify whether a natural loop changes the stack frame or survives as a runtime loop.
- Revert every regressing candidate, but preserve the strongest local observation across retries so later passes resume from the diagnosed six-instruction window instead of reopening the whole function.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: no
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, float-literal-tricks, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning, checkpoint-restore
