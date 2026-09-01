## Verdict

The exact worker treated the diff as evidence about the compiler's whole frame and register-allocation state, then measured each source-shape change in local disassembly. The near-miss worker correctly isolated a register-only residual, but stayed narrowly focused on rewriting the `anim_frames[22]` expression or moving its counter declaration. It did not systematically perturb other live locals or scopes that could change allocation pressure. That broader, measured hypothesis search is the main process difference.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level and hypothesis-driven, with some early trial edits. It explicitly tracked frame size and stack slots: "The reference uses 0x14/0x18/0x1C and a 0x68-byte frame." Later it tested the allocator effect of unrelated locals under "Testing removal of local literals."
- The decisive move: it first established that moving `Vec3 scale` into a later inner scope moved its stores from `0x20/0x24/0x28` to `0x10/0x14/0x18`. Adding `PAD_STACK(4)` then placed them at `0x14/0x18/0x1C`, but the frame remained too large. Removing the three float locals `trans_x`, `scale_base`, and `rot_y` and inlining their constants reduced the frame from `0x70` to the target `0x68`; checkdiff immediately passed. It then simplified the temporary representation back to scoped `Vec3 scale` plus `PAD_STACK(4)` and reconfirmed 100%.
- Tool rhythm: roughly 10 edit or source-shape experiments, usually followed by `ninja` plus `powerpc-eabi-objdump`; `checkdiff_run` was used at milestones because its service initially appeared stale. Stack and regflow diagnostics, ledger/graph search, and past-PR search informed the investigation, but no permuter produced the solution. Final checks covered the target, its neighbor, build success, and `git diff --check`.

## Near-miss worker: why it stalled

- It got stuck on the `anim_frames[22]` compare chain, where the target loaded and compared through `r4` while the candidate used `r0`. It tried direct repeated field access, explicit unsigned casts, `s32` and `u32` locals, block-scope versus function-scope declarations, an inline animation helper, allocator diagnostics, and two bounded permuter runs. It never performed the exact worker's broader register-pressure experiment: remove, inline, or rescope other live locals around the mismatch and inspect how the candidate register assignment changes.
- The stall was diagnosable from its own output. It accurately wrote: "the target uses r4 for the anim_frames[22] load and three unsigned comparisons, while the candidate uses r0." It did not misread that evidence, but it treated the source expression as the likely control knob even after several forms compiled identically. The allocator snapshot was captured but did not lead to a new source-shape hypothesis.
- Loop quality: mixed. Experiments were reversible and validated, and regressions were restored promptly. However, many iterations repeated near-equivalent counter rewrites after they had shown no codegen effect; the inline-helper analog caused a large regression, and the permuter searches found no improvement.

## Transferable technique

- When stack offsets or saved-register slots differ, rebuild locally and compare exact frame size and local offsets after every declaration-scope or lifetime change; do not rely only on a stale aggregate diff service.
- When a visible local reaches the right stack slot but the frame is still too large, inline or rescope unrelated scalar constants whose lifetimes may widen the frame, then recheck the prologue and saved-register range.
- When the only residual is a source-register choice, stop repeating equivalent forms once they compile identically. Perturb the lifetime and scope of other live locals around that instruction, and inspect allocator or disassembly output after each bounded change.
- Revert regressions immediately and validate the final source shape with focused checkdiff, a neighboring function check, a clean build, and `git diff --check`.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: yes
- techniques: asm-diff-instruction-level, stack-frame-reasoning, register-allocation-reasoning, type-shape-experiments, inline-hypothesis, permuter, past-pr-lookup, checkpoint-restore
