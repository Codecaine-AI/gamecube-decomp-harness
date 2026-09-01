## Verdict

The most important process difference was what each worker did after identifying a relocation-only gap. The exact worker traced the bad `lfs` reference through objdiff JSON, the target assembly's constant value, the source literal, and the translation unit's `.sdata2` order, then fixed both the literal and constant ordering. The near-miss worker eventually localized its gap just as precisely, but tested only three closely related sentinel spellings and stopped instead of systematically deriving more source shapes from other uses of the desired named constant. Target circumstances mattered because the exact worker had a dedicated `.sdata2` repair helper, but its tighter evidence-to-experiment loop still explains part of the outcome.

## Exact worker: how the gap was closed

- **Diff-reading style:** Instruction and relocation level, not blind source permutation. Its reasoning explicitly moved through "**Analyzing instruction address offsets**" and then "**Fixing function call literal to 0.01f**." It extracted the mismatching `lfs f3, lbl_804DA824@sda21`, inspected the symbol's target value, and checked candidate `.sdata2` contents.
- **The decisive move:** The target assembly showed `lbl_804DA824` was `.float 0.01`, while the final `fn_8018FDC4` argument was `80.0f`. Changing it to `0.01f` made the instructions match, but checkdiff still reported different data references. Regenerating the sanctioned `sdata2_order` helper then aligned all 35 entries and 152 used bytes, giving the literal the correct relocation and flipping checkdiff to 100%.
- **Tool rhythm:** Systematic triage, then roughly two edit/validate cycles: source + full diff + ledger/graph, symbol/helper inspection, helper apply + checkdiff, deeper objdump/objdiff/assembly inspection, literal edit + checkdiff, full helper regeneration + final checkdiff. It made five `checkdiff_run` calls and used ledger and related-function graph searches, direct object/symbol inspection, objdiff JSON, and the `.sdata2` helper. It did not use a permuter or past-PR search.

## Near-miss worker: why it stalled

- It got stuck on one relocation at the inner sentinel comparison. Candidate and reference had identical bytes for all 700 instructions, but the candidate reload referenced a local `-F32_MAX` pool symbol while the reference referenced `grBb_804DB310` at the same `.sdata2+0x20` value. It tried positive-sentinel, double-negation, and explicit `-3.40282347e+38f` forms. The first two removed the required reload and shortened the function; the third kept the instruction shape but still created a local symbol. All were reverted.
- The stall was diagnosable, and the worker eventually read it correctly: "Existing candidate and reference instruction bytes are identical across all 700 instructions; the remaining mismatch is a single relocation at the inner sentinel comparison." It did not ignore that evidence, but reached it late after repeated `wibo` infrastructure probes and stale-object uncertainty.
- It never converted other in-file relocations to `grBb_804DB310` into concrete source patterns, nor systematically enumerated declaration, temp, type, or access shapes that could retain the reload while changing constant ownership. It also never ran an automated variant matrix or permuter. Its loop was mixed: strong binary diagnosis and careful reverts, but repetitive setup work followed by a narrow manual guess set.

## Transferable technique

- When instruction bytes match but relocation operands differ, inspect the target symbol's value, candidate constant-pool offset, and source literal before changing control flow or register allocation.
- After correcting a literal, rerun the full diff; if instructions match but data references do not, inspect and repair translation-unit `.sdata2` ordering with the project's sanctioned helper.
- When one constant spelling preserves instructions but selects the wrong symbol, enumerate source-shape variants beyond spelling, including named access, temp/declaration shape, type, and volatility, and score each from a clean checkpoint.
- If the normal compiler wrapper fails, use the available emulator to restore a tight edit, compile, diff loop instead of repeatedly treating the wrapper failure as terminal.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, float-literal-tricks, past-pr-lookup, checkpoint-restore, sdata2-ordering
