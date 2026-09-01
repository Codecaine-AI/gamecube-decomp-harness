## Verdict

The exact worker escaped a register-allocation mismatch by treating helper boundaries and variable lifetimes as the source structure to recover, not merely by permuting expressions inside the current function. Both workers read allocator evidence carefully and ran many controlled probes, but the exact worker eventually split option-root setup and value-update/selection resolution into local inline helpers, reused one `HSD_JObj*` across animation paths, and repaired inlining scope until the target and neighbors stayed exact. The near-miss worker understood its r25/r30 and stack-home mismatch just as well, yet kept searching mostly through declaration order, types, aliases, parameter permutations, and small helper variants; none changed the interference graph in the needed way.

## Exact worker: how the gap was closed

- Diff-reading style: instruction- and register-level diagnosis drove the search. It explicitly reasoned, "The residual diff is concentrated in an r28/r30 allocation swap" and later, "The common HSD_JObj local eliminated the r21/r22 selection-animation swap." Source variants were tests of those hypotheses, not blind edits.
- The decisive move was structural helper extraction. A common `HSD_JObj*` first removed the selection-animation register swap and raised an intermediate candidate from 99.83425% to 99.94475%. Extracting the arg2 value-update path into `mn_802327A4_UpdateValue` then removed the remaining r26/r30 tree-pointer swap and produced 100%. The retained form recovered option-root initialization and value-change/selected-option resolution as local inline helpers, plus a natural indexed `mn_80232660` loop.
- Reaching a gate-clean result required another observation: broad `dont_inline` control affected the target and neighbors. The worker narrowed, tested, and finally removed the added pragmas while preserving exact code, then reformatted a helper declaration to satisfy the static-symbol micro-gate.
- Tool rhythm: several long edit -> compile/checkdiff or candidate-score loops, well over 30 focused variants across the condensed sessions. Pivotal tools were full asm/objdiff inspection, MWCC regflow/stack and allocator snapshots, candidate scoring, past-PR/ledger/graph searches, and bounded permuter runs. The permuter did not find the answer; manual helper/lifetime restructuring did.

## Near-miss worker: why it stalled

- It got stuck on a coherent allocator cluster: reference saves r25-r31, holds volume mix in r30, uses r25 for the second translation JObj, and places conversion scratch homes at 0x68/0x6C; current code saves r26-r31, uses r29/r30 differently, and places homes at 0x70/0x74.
- It tried extensive controlled variants: mix type and placement, aliases, unused-parameter reuse, pointer scopes, PAD placement, helper return/output forms, helper extraction, all 120 channel-helper parameter permutations, all 120 volume-local declaration permutations, allocator snapshots/comparison, and 1,000- and 5,000-iteration permuter runs. It restored baseline whenever a probe regressed.
- What it never tried was the exact worker's successful scale of restructuring: decompose the main routine into separate semantic inline helpers while deliberately sharing a caller-owned pointer/local across distant animation paths, then tune those boundaries together. Its helper experiments stayed centered on volume/channel initialization and mix transport rather than rebuilding the function's broader lifetime topology.
- The stall was diagnosable from its own output and was not ignored. Its line, "The ordinary persistent u8 mix increases the GPR virtual-register count from 116 to 117 and shifts coloring rather than simply occupying the desired r30 lifetime," accurately explains why the obvious fix failed. The weakness was search scope, not diff misreading.
- Loop quality: systematic. It formed allocation hypotheses, isolated variables, exhaustively enumerated several spaces, scored each result, and reverted regressions. It simply exhausted a narrower family of source shapes.

## Transferable technique

- When the remaining diff is a saved-register cycle plus shifted stack homes, inspect the allocator graph, then test semantic helper boundaries that shorten whole groups of live ranges; do not stop at declaration and type permutations.
- When two distant paths need the same physical-register lifetime, test one caller-owned local reused across both paths instead of separate block-local pointers.
- After a helper extraction fixes one register swap, rescore the exact instruction window and extract the next semantic path responsible for the remaining swap; preserve each measured gain as a checkpoint.
- Validate inlining changes against the target and neighboring functions. Narrow or remove `dont_inline` pragmas once natural source structure emits the exact code.

## Flags

- exact_loop: systematic
- control_loop: systematic
- outcome_explained_by_process: yes
- techniques: asm-diff-instruction-level, register-allocation-reasoning, inline-hypothesis, stack-frame-reasoning, permuter, past-pr-lookup, type-shape-experiments, checkpoint-restore
