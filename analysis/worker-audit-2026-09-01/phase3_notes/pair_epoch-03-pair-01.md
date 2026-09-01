## Verdict

The transcripts do not support the premise that the nominal exact worker used a better process to reach 100%. Its recorded work ends at 99.90741% with two relocation-only mismatches, whereas the nominal near-miss worker actually found a 100% source form, then replaced it because `(char**)` aliasing failed the quality gate and accepted 99.85714%. The clearest process difference is that the near-miss worker kept testing local access-shape hypotheses until it isolated an exact but unacceptable mechanism; the exact worker stopped after making all instructions match and did not resolve or experimentally route around the remaining constant relocation. The reported final 100% for `mn_8022FD18` must come from work absent from this condensed transcript, so process explains the near-miss outcome but not the labeled exact outcome.

## Exact worker: how the gap was closed

- Diff-reading style: mixed. It read concrete load and relocation evidence, then tested type-shape variants rather than blindly rewriting control flow. Examples: "Changing const to mutable for three variables" and "Two relocation-only mismatches: target references mn_804DBDF0 for u8-to-float conversion while candidate references compiler-local @330."
- The decisive recorded move was modeling packed constants as unions and structs, then assigning whole objects. Restoring `const` avoided data-section regressions; adding `ByteIndex` made the last byte load compile correctly. This moved 92.77778% to 99.90741% and made every instruction match. No recorded move flipped the target to 100%; `mn_804DBDF0` ownership/order remained unresolved.
- Tool rhythm: roughly five edit and checkdiff cycles, with a summary check after promising states. It opened with checkdiff, related-function graph, ledger, and past-PR searches. The ledger supplied prior declaration-order and loop-shape history, but the pivotal work used full diffs, symbol metadata grep, and small type-shape experiments. No permuter was run in this transcript; only prior failed permuter runs appeared in ledger results.

## Near-miss worker: why it stalled

- It first found that mutable pointer definitions restored the target loads, but that changed `.sdata` ordering and hurt a neighboring function. It then localized the effect: volatile pointer-lvalue reads reached 98.85714%, plain `*(char**) &symbol` reads reached 100%, and a typed inline loader passed lint but changed the stack frame from `0x40` to `0x30`, leaving 99.85714%.
- The stall was diagnosable. Its final full diff named prologue and stack-slot differences, and it correctly wrote, "The remaining mismatch is stack-frame/stack-slot layout: candidate uses a 0x30-byte frame while reference uses 0x40 bytes." It did not try explicit stack-frame-shaping experiments after that result, such as changing helper inlining or local lifetime/shape while retaining typed access. The exact worker's union/struct playbook also suggests a typed wrapper object or whole-object copy experiment; none was tried after the inline helper stalled.
- Loop quality: systematic. Each variant tested one mechanism: declaration mutability, volatile access, nonvolatile aliasing, typed wrapper/union, then typed inline helper. It checked full diffs at the points needed to identify register or frame fallout and reverted rejected changes.

## Transferable technique

- When a `const` data object is folded but the target loads it, test declaration mutability and localized lvalue access separately; compare code match, data-section ownership, and neighboring functions before retaining either.
- When instructions match but relocations do not, inspect symbol metadata and distinguish code-shape success from data ownership/order; do not report exact until the relocation target also matches.
- When a helper leaves only prologue and stack-slot differences, treat that as stack-frame evidence and vary helper inlining and typed local/object shape one at a time.
- After an exact variant fails a lint or ownership gate, keep it as a diagnostic checkpoint: identify the precise compiler behavior it caused, then reproduce that behavior with typed source rather than discarding the clue.

## Flags

- exact_loop: mixed
- control_loop: systematic
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, type-shape-experiments, stack-frame-reasoning, checkpoint-restore, past-pr-lookup
