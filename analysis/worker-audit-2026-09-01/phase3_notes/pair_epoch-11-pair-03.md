## Verdict

The exact worker kept turning observed byte offsets, sizes, and relocations into narrow layout hypotheses, so each loop removed a known part of the gap; the near-miss worker also diagnosed its diff correctly, but spent most of its effort cycling through a huge local register-allocation search before a late higher-level loop rewrite improved the score. That focus difference mattered, but it only partially explains the outcome: the exact target reduced to deterministic data reconstruction and padding, while the control's last five instruction differences depended on MWCC register coloring that resisted every evidenced source-shape tactic.

## Exact worker: how the gap was closed

- **Diff-reading style:** It did not reason about PPC instructions or registers. It compared reference and candidate `.data` bytes, symbol sizes and order, section offsets, and relocations, then decoded packed fields and floats. Its reasoning stayed concrete: "**Analyzing raw byte data match**" and "**Fixing literal padding and section alignment**".
- **The decisive move:** `readelf`, `nm`, `objdump`, and `objcopy` established a 4040-byte target and the object boundaries. Python decoding produced typed character tables, packed tables, `HSD_WObjDesc` objects, and the camera descriptor. After the values matched, a 4034-versus-4040 size discrepancy and remaining byte insertions pointed to tail padding. Correcting one float literal and changing the final diagnostic string from fixed `char [...][0x3C]` to an unsized array made the emitted section `4040 100.0`. Reintroducing the fixed size during semantic renaming dropped it to 99.92568; restoring the unsized form returned 100%, confirming the cause.
- **Tool rhythm:** Roughly 12-15 build cycles and 8-12 byte/diff checks followed `inspect/extract -> generate or edit declarations -> ninja -> objcopy/cmp or objdiff -> inspect the next offset`. Pivotal tools were binutils, small Python decoders/generators, `objdiff-cli`, and final `checkdiff` regression checks. Past-PR, ledger, knowledge, and code-graph searches supplied typed-data and relocation precedents. It used no permuter and saved/restored source and object checkpoints during experiments.

## Near-miss worker: why it stalled

- It first isolated an add-plus-copy versus two-independent-`addi` mismatch, then ultimately improved 99.5% to 99.67391 by keeping a stable center index, using a pre-incremented offset, separating comparison and lookup cursors, and widening the low bound to `s32` with a byte copy. The residue was a physical-register swap across five instructions: generated cursor `r27` versus target `r30`, and generated lower bound `r30` versus target `r27`.
- It tried declaration and initialization order, types and casts, helper extraction and parameter order, scopes and lifetimes, self-assignments, loop and induction rewrites, pragmas, allocator/PCode inspection, scripted variant matrices, past-PR and graph searches, and several permuter runs up to 10,000 candidates. There is no clear exact-worker tactic it never tried that transfers to this code target; it even used checkpoint restoration and higher-level restructuring. What it failed to do early was impose a stopping rule on the repeated local coloring experiments and pivot sooner to the stable-center loop shape that produced the only retained gain.
- The stall was diagnosable and was neither misread nor ignored. The worker wrote: "The remaining mismatch is a single r27/r30 allocation swap affecting five instructions." Earlier it also proved that `(u8) idx + 1` created the target's two independent additions, but that form regressed scheduling and coloring.
- **Loop quality:** Mixed. The allocator snapshots, exact register mapping, exhaustive matrices, reverts, and regression checks were systematic. The repeated one-off variants and rediscovery of the same CSE/coloring constraint made the overall search sprawling and partly shotgun.

## Transferable technique

- When a data target differs broadly, extract both sections and map the first differing byte to symbol boundaries before editing source; reconstruct typed objects from offsets and relocations rather than guessing declarations.
- When values appear correct but section size differs, test compiler-controlled padding directly, including fixed versus inferred array length, and confirm with raw byte comparison.
- When a few instructions differ, name the exact operation and physical-register mapping, then use allocator/PCode snapshots to distinguish a source-shape error from a coloring or scheduling error.
- Set a stopping rule for local declaration, cast, and scope permutations; after bounded searches reproduce the same allocation, pivot to a higher-level loop or lifetime shape and retain only measured improvements.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: data-layout-reconstruction, binary-section-byte-comparison, type-shape-experiments, past-pr-lookup, checkpoint-restore, asm-diff-instruction-level, register-allocation-reasoning, permuter, loop-restructure, inline-hypothesis, scheduling-reasoning
