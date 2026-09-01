## Verdict

The exact worker eventually changed the abstraction boundary instead of continuing to perturb locals: it recognized that the open-coded floor check and ignored-floor filter duplicated the existing `ftCo_800A0FB0` helper, replaced the whole region with that helper, then treated the remaining diff as a stack-frame problem. The near-miss worker diagnosed its remaining operands carefully, but stayed inside one model, trying overlays, casts, helper wrappers, declaration order, and pointer order to force two relocation bases. It never searched for or adopted a pre-existing higher-level source shape that could make MWCC emit the desired references naturally. That process difference, more than target luck, explains the outcomes, though the near-miss's literal-ownership constraint also narrowed its legal solution space.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level and register-aware, followed by targeted source experiments. It localized the baseline to "the same eight operands: reference result r28 and line r31 versus candidate result r27 and line r28." It also explicitly moved from the register symptom to structure: "Recovered the authored helper boundary in ftCo_800A8940 by replacing the open-coded mpCheckFloor and target-local ignored-floor filter with the existing ftCo_800A0FB0 helper."
- The decisive move: after extensive failed attempts to rotate `result`, `blocked`, and `line_id` through helper signatures, aliases, scopes, declaration order, pointers, and condition forms, it removed the target-local inline helper and open-coded floor/filter sequence and called existing `ftCo_800A0FB0`. That raised 99.86532% to 99.91582% and changed the remaining evidence from register operands to an eight-byte frame/stack-offset mismatch. Adding `PAD_STACK(8)` then produced 100%.
- Tool rhythm: mostly edit -> `checkdiff_run(full_diff)` -> inspect the changed operands -> revert or refine, roughly 35-45 checks across the full transcript. Pivotal tools were full instruction diffs, target/candidate objdump and asm reads, allocator snapshots for virtual-to-physical register coloring, source/related-function searches that exposed `ftCo_800A0FB0`, and direct compilation. A 1,500-candidate permuter run found nothing better; past-PR, ledger, graph, and knowledge searches supplied context but not the final source.

## Near-miss worker: why it stalled

- It got stuck on prologue and later address operands rooted at anonymous `.bss.0` and `.data.0` rather than `lbl_80472ED8` and `lbl_803D8D08`. It tried a typed state overlay, direct casts, inline getters, archive-loader and spawn-table helpers, declaration and assignment ordering, a union overlay, comma expressions, `PAD_STACK` removal, and a small permuter attempt. It never tried the exact worker's strongest move: find an existing semantically equivalent helper or neighboring authored source shape and replace the whole problematic region before fixing residual frame layout.
- The stall was diagnosable, and it did diagnose it. Its final statement says, "The relaxed mismatches are base-relative operands caused by MWCC rooting state and Kumite literal addresses at anonymous .bss.0 and .data.0 section symbols." It did not ignore the diff. The weakness was fixation: once the typed overlay corrected offsets but swapped base-load order, it kept varying the same pointer/overlay representation instead of broadening the source-shape hypothesis.
- Loop quality: systematic. It manually compiled through `qemu-i386`, scored candidate objects, compared strict and relaxed objdiff output, tracked exact instruction and relocation changes, checkpointed the source, and reverted every regression. The loop was disciplined but too narrow.

## Transferable technique

- When a near-exact diff is only a register rotation, map each mismatched register to its source value, then test source shapes that change live ranges and coalescing; do not judge variants only by overall score.
- After several local register-allocation variants fail, search the same file and related functions for an existing helper that implements the entire open-coded region, then test replacing the region at that helper boundary.
- When a structural rewrite improves the score and leaves only prologue or stack offsets, stop changing logic and adjust stack shape explicitly, including a narrowly sized `PAD_STACK` experiment.
- Checkpoint before source-shape experiments, compile and diff every variant, and restore the best known source immediately when a variant regresses.

## Flags

- exact_loop: mixed
- control_loop: systematic
- outcome_explained_by_process: yes
- techniques: asm-diff-instruction-level, register-allocation-reasoning, inline-hypothesis, stack-frame-reasoning, permuter, past-pr-lookup, checkpoint-restore
