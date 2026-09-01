## Verdict

The exact worker treated the last gap as a register-liveness problem and kept drilling down until it found a source construct that changed allocation without changing emitted instructions. The near-miss worker also read registers and tried helper/source-shape experiments, but after its useful helper extraction it spread effort across separate relocation, register, and stack-slot mismatches without deriving a constraint for the next edit. The clearest process difference was targeted compiler-mechanism diagnosis versus increasingly local guess-and-check.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level and register-specific. It summarized the residual as: "the reference uses r4 for one load and three unsigned comparisons, while the candidate uses r0" and later stated, "Target/current disassembly isolates the meaningful difference to the anim_frames[22] range check." It used objdump, MWCC regflow, and allocator snapshots to trace the comparison value to virtual register 47 and its interference set.
- The decisive move: a repository search found an existing `MUST_MATCH` self-assignment whose comment said it kept a variable live for MWCC. The worker generalized that clue into a dead read, `(void) sub->anim_frames[counter]`, after the update block. This extended `counter`'s allocator lifetime, selected r4 for the load and three `cmplwi` instructions, emitted no extra instructions, and produced 100.0% in runner-equivalent objdiff.
- Tool rhythm: inspect diff and disassembly, form one allocator hypothesis, batch-compile source variants, inspect the relevant instruction window, then restore failures. There were dozens of edit/build/check cycles plus scripted batches covering many more variants. Pivotal tools were `mwcc_alloc_snapshot`, objdump, source searches for matching tactics, past-PR/knowledge/ledger searches, and two permuter runs of 1,000 and 2,000 iterations. The permuter did not solve it; the liveness experiment did.

## Near-miss worker: why it stalled

- It improved the initial digit-animation block by extracting `ifStatus_InitDamageDigits`, restoring the ones-digit allocation. It then remained stuck on a `1.0F` `.sdata2` relocation-name mismatch, the hundreds JObj in r28 instead of r24 across five operands, and damage-color GXColor stack-slot and relocation differences.
- It tried separate digit locals and pointers, nested and combined helpers, declaration order, helper argument order, assignment placement, direct object disassembly, history lookup, and a 1,000-candidate permuter run. It never captured allocator liveness/interference for the r28/r24 value, searched the repository for a dead-read/self-assignment matching tactic, or tested a deliberate no-code lifetime extension like the exact worker.
- The stall was partly diagnosable from its own diff. The repeated `lwz r24, 0x54(r31)` versus candidate r28 cluster identified one shared live-range/allocation issue, and its own final note says it was "affecting five operands." It recognized the register cluster but did not turn that evidence into an allocator constraint. The relocation and stack-slot mismatches were separate problems, so a single helper reshuffle was unlikely to clear all of them.
- Loop quality: mixed. The helper-boundary experiment was evidence-based and improved the score. After that, repeated pointer/local/helper permutations returned the same 99.87673 focused score, yet the loop continued without a new diagnostic model; the permuter was used only after many no-change manual variants.

## Transferable technique

- When the residual diff is the same value in the wrong register across several instructions, trace that value's live range and interference graph before changing expressions.
- Search existing matching code and past work for compiler-shaping constructs that address the diagnosed mechanism, then adapt the construct locally.
- For a register-only mismatch, test dead reads or self-assignments under `MUST_MATCH` at specific control-flow points to extend lifetime without adding instructions; verify the emitted instruction count and operands.
- After two or three source-shape variants produce the identical diff, stop permuting declarations and obtain new evidence from allocator snapshots or disassembly.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: yes
- techniques: asm-diff-instruction-level, register-allocation-reasoning, scheduling-reasoning, past-pr-lookup, permuter, inline-hypothesis, type-shape-experiments
