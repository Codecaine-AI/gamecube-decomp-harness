## Verdict

The exact worker made the search space concrete before editing: it turned a 24-byte `.data` size deficit into one missing object at one known offset, then verified bytes and relocations. The near-miss worker also read the diff at instruction level and correctly diagnosed its remaining register, spill, and frame mismatches, but it did not keep the final search equally narrow. It cycled through broad helper, scope, type, and expression rewrites instead of exhaustively enumerating source shapes for the last known allocator cycle. Process explains part, not all, of the outcome because a missing data object is more directly invertible than intertwined register allocation.

## Exact worker: how the gap was closed

- **Diff-reading style:** Systematic data-layout forensics, not source guess-and-check. It compared target and candidate section sizes, symbol offsets and sizes, raw dumps, and relocation offsets. Its reasoning identified an "Analyzing label size discrepancy," then stated the exact consequence: "This restores the missing 24-byte object before `lbl_803D9750`."
- **The decisive move:** The target symbol table showed a distinct 24-byte object at `.data+0x4f0`; the candidate was exactly 24 bytes short there. Assembly tied that slot to `lbl_803D9738` and `"ScItrAllstar_scene_data"`. Adding a mutable character array with that string immediately restored the 1504-byte layout, byte-for-byte equality, and relocation offsets. The worker later renamed it `gm_Scene_IntroAllstar_SceneDataName` to satisfy review lint without losing the match.
- **Tool rhythm:** Inspect and search, form one layout hypothesis, edit, compile, then inspect with `readelf`/`nm`/`objdump`/`objcopy`, raw `cmp`, and objdiff. The first edit reached 100%; about four later edit/build/inspect cycles tested acceptable ownership and naming forms while preserving it. Past-PR, ledger, and code-graph searches supplied context but not the answer. No permuter was used.

## Near-miss worker: why it stalled

- It ended with a `0x78` frame instead of `0x58`, swapped `r28`/`r29` live ranges, second and pairwise `sqrtf` spills at `0x24`/`0x20` instead of `0x10`/`0x0C`, and a small FPR cycle around collision radius and force strength. It tried helper extraction/removal, helper signatures, direct field access, pointer and loop forms, declaration order, scopes, result types, float expression shapes, historical versions, allocator diagnostics, and three permuter runs.
- Its final gain came from direct `Vec3` access, removing the `update_y` helper while preserving `current_y`/`old_y` lifetimes, and splitting collision-radius initialization from scaling. It never completed a tightly bounded enumeration of equivalent expressions aimed only at the remaining FPR cycle while holding the 99.61855 checkpoint fixed.
- The stall was diagnosable from its own output and it did not ignore that evidence. It wrote: "The persistent pairwise-force mismatch is an allocator cycle: the target initially uses f11 for distance, f13 for the half-radius term, f12/f11 for the two size loads and sum, while current source rotates those roles through f12/f11/f13." The failure was translating that diagnosis into a narrow search.
- **Loop quality:** Mixed. It repeatedly inspected exact instructions, registers, stack slots, and scores, and it checkpointed its best patch. But 75 edits and 71 checkdiff runs included long speculative stretches and repeated regressions before restoration.

## Transferable technique

- For a data-section mismatch, compare target and candidate section sizes, symbol offsets and sizes, raw bytes, and relocation offsets before editing; use a fixed byte deficit to identify the missing object and insertion point.
- After a section reaches 100%, validate raw bytes, relocations, and sibling sections, then keep that checkpoint while repairing naming or lint issues.
- When the remaining diff is a known register-allocation cycle, freeze the best checkpoint and enumerate only equivalent source expressions that change the implicated live ranges, one variable or expression boundary at a time.
- After each source-shape experiment, record whether it changed the specific frame, spill slot, or register cycle; stop broad helper or scope rewrites once they leave that evidence unchanged.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: data-section-layout, past-pr-lookup, asm-diff-instruction-level, register-allocation-reasoning, permuter, type-shape-experiments, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning, checkpoint-restore
