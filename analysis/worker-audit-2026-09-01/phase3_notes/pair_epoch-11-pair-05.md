## Verdict

The exact worker converted its diff into one concrete object-layout hypothesis, then tested that hypothesis directly: `.sbss` was short by 16 bytes, so it restored the missing declarations with the target's symbol order, size, and linkage. The near-miss worker was at least as systematic, but its instruction-level diagnosis stopped at compiler symptoms, a five-register coloring rotation plus stack-slot offsets, for which many plausible source shapes were neutral or worse. Thus the useful process difference was actionability of the hypothesis, not persistence or search breadth; target tractability still explains much of the outcome.

## Exact worker: how the gap was closed

- Diff-reading style: evidence-led section and symbol analysis, not instruction-level asm reading and not broad source guessing. It inspected target/candidate section tables, symbols, `symbols.txt`, sibling declarations, and objdiff JSON. The reasoning stated, "**Planning to add missing static data declarations**" and later validated, "`.text: 100.0% | .data: 100.0% | .sbss: 100.0%`."
- The decisive move: add `static UNK_T exit_data[2]`, `static UNK_T gm_804D6910[2]`, and global `UNK_T gm_804D6918[2]` in address order. The chain was: objdiff showed `.text` and `.data` exact but `.sbss` at 50%; readelf/symbol metadata showed a 24-byte target section and the missing local/global objects; sibling files and history confirmed declaration conventions; one edit produced a 24-byte, 100% `.sbss` while retaining the other exact sections.
- Tool rhythm: inspect broadly, form one layout hypothesis, edit once, compile, then validate with objdiff/readelf and lint. There was one substantive edit-to-score iteration. Pivotal tools were object section/symbol inspection, objdiff JSON, `symbols.txt`/sibling grep, git history, and knowledge/past-PR searches. No permuter was used.

## Near-miss worker: why it stalled

- It got stuck on 76 argument-only differences: a coordinated five-register allocation rotation in the block-map scan, seven register differences in first-chunk arithmetic, and four groups of command-object stack offsets. It tried declaration and initialization permutations, variable scopes and lifetimes, loop forms, pointer/array representations, signedness and arithmetic shapes, helper splitting/inlining, command buffer shapes, padding, historical revisions, allocator capture, and hundreds of mutations/permuter candidates.
- It never found the counterpart to the exact worker's playbook: a single source-level fact independently supported by object metadata that predicted all residual differences before editing. It did try the analogous evidence sources, including history, siblings, stack diagnostics, and allocator snapshots, so this is not a simple omitted-tool failure.
- The stall was diagnosable as register coloring and stack allocation from its own diff. It did not ignore that evidence: "The remaining 76 differences are argument-only mismatches: a five-register rotation in the block scan, seven first-chunk arithmetic register differences, and command-object stack-slot/register differences." The problem was causal resolution. The diff identified where allocation differed, but not which original source shape would force retail coloring.
- Loop quality: systematic. Experiments were grouped by hypothesis, scored against the same baseline, checked for neighbor regressions, and reverted when neutral or worse. Some late searches became broad, but they remained measured rather than shotgun.

## Transferable technique

- When a data-section target is partial, compare target and candidate section sizes and symbol tables first; reconstruct declarations in address order with exact size, linkage, and alignment before trying source-shape permutations.
- When asm opcodes and control flow match but operands differ, classify the mismatches as coordinated register rotations or stack-slot groups, then map each group to source variable lifetimes before editing.
- Score one bounded source-shape hypothesis at a time, preserve the best baseline, and revert neutral or regressive candidates immediately.
- If manual compiler invocation is blocked by host architecture, reproduce the canonical compile through an emulator and keep objdiff validation identical; do not treat runner failure as target evidence.

## Flags

- exact_loop: systematic
- control_loop: systematic
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, stack-frame-reasoning, checkpoint-restore, inline-hypothesis
