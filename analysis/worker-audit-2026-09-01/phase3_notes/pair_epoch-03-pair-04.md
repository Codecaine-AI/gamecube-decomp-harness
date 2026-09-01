## Verdict

The exact worker turned the first diff into a concrete data-identity hypothesis, while the near-miss worker kept reshaping C around an already-known opcode-placement problem. The exact diff showed one `lfs` loading the wrong `.sdata2` symbol; after searching the relevant constant, the worker corrected a visibly mistyped sentinel and finished in one edit. The near-miss worker correctly identified the desired `clrlwi`/`mr` record-bit ordering, but repeated closely related type and expression experiments without developing a new constraint that could preserve both that ordering and the stack/register shape. Process explains part of the outcome, though the exact target's lone bad literal was substantially easier than the control's compiler-scheduling problem.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level and semantic, not broad guess-and-check. The worker saw the sole operand mismatch, `lfs f1, grBb_804DB310@sda21` versus `lfs f1, @1394@sda21`, searched `grBb_804DB310`, and concluded: **"Correcting sentinel value to -F32_MAX"**. Its final explanation was equally specific: **"Corrected the initial sentinel ... from the mistyped 3.4028235e28f to -F32_MAX."**
- The decisive move was replacing `3.4028235e28f` with `-F32_MAX`. The chain was short: focused diff isolated the wrong float-pool reference, symbol search exposed the intended constant context, and source inspection exposed both a missing minus sign and the wrong exponent. The next checkdiff was 100%.
- Tool rhythm: inspect/search plus checkdiff, one edit, one checkdiff. Pivotal tools were full diff, symbol grep, source read, and ledger/graph lookup. A git-history lookup was attempted but did not produce the answer. No permuter was used.

## Near-miss worker: why it stalled

- It was stuck on CR0 update placement: reference `clrlwi r0, r0, 16; mr. r7, r0`, candidate `clrlwi. r0, r0, 16; mr r7, r0`. It tried assignment inside the condition, `u16` and `s32` locals, split masking/casting, casting only in the condition, and a separate trigger temporary. It also ran 500- and 300-iteration permuter searches. It never found or tested a source form that jointly controlled CR scheduling and retained the original `0x18` stack frame, despite its ledger explicitly identifying that coupled constraint.
- The stall was diagnosable at the assembly level. The worker repeatedly stated the exact evidence, including **"Reference: clrlwi r0, r0, 16; mr. r7, r0"**, and noticed that a trigger temporary enlarged the frame to `0x20`. It did not ignore the diff, but it failed to turn those two facts into a fresh targeted experiment; later passes repeated assignment-in-condition and `u16` variants already shown to regress.
- Loop quality: mixed. Each edit was checked and reverted cleanly, and regflow, asm-window, knowledge, ledger, and permuter tools were consulted. Across repeated passes, however, the hypothesis set became repetitive rather than cumulative.

## Transferable technique

- When a diff differs only by a constant-pool symbol, resolve both symbols and inspect the source literal for sign, exponent, suffix, or named-constant errors before changing control flow.
- When two adjacent instructions differ only in record-bit placement, treat them as one scheduling constraint. Test source shapes against both instructions, not merely the branch result.
- Record every failed source shape and its score, then exclude it from later passes. Do not repeat type or inline-condition variants unless a second constraint has changed.
- When a temporary fixes instruction ordering but changes the stack frame, preserve the ordering hypothesis and search specifically for a non-spilling expression or an offsetting frame-shape change.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, type-shape-experiments, float-literal-tricks, scheduling-reasoning, stack-frame-reasoning, permuter, checkpoint-restore
