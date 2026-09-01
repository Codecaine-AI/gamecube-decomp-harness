## Verdict

The exact worker's main process advantage was provenance recovery: after instruction-level allocator analysis and several failed source-shape experiments, it searched target-specific git history, found `worker-integration(job-b9d1)` commit `3287b43`, and restored that known instruction-exact implementation. The near-miss worker also inspected history, allocator captures, and diffs, but never found or reconstructed an exact prior shape; it stayed in local helper, lifetime, declaration, and permuter experiments. Process therefore explains part of the outcome, but the exact target's available prior exact checkpoint was a material advantage.

## Exact worker: how the gap was closed

- Diff-reading style: mostly instruction and register specific, not blind source guessing. It framed the problem as "**Analyzing register allocation conflicts**" and then "**Mapping virtual registers to physical registers**," using full diffs, side-by-side disassembly, and MWCC allocator/coloring JSON. It also tested focused source variants when a register-lifetime hypothesis suggested them.
- The decisive move: `git log --all --grep='fn_80178050'` exposed commit `3287b43`. Inspecting and restoring that commit's function changed the result from roughly 98.6% to instruction-identical, reported as 99.89825% only because constant-pool relocation identities differed. The worker verified the runner's configured comparison with `objdiff_score_candidate`, which returned 100%. A generated `.sdata2` ordering helper temporarily made strict `checkdiff` report 100%, but it was rejected and removed; the retained exact result was the recovered function shape plus runner-configured relocation equivalence.
- Tool rhythm: broad read-only triage first, then repeated edit -> `checkdiff_run` loops, with allocator snapshots and direct disassembly at pivotal points. Roughly 10 source-shape checks preceded the history recovery, followed by several constant-pool and validation loops. Pivotal tools were git history/blame, `past_prs_search`, allocator capture, direct compile, full checkdiff, and objdiff scoring. No permuter supplied the winning source.

## Near-miss worker: why it stalled

- It got stuck on a residual stack-frame-size/placement and GPR/FPR-coloring mismatch after helper extraction raised the score to 99.57658%. It tried alias forms, scopes, declaration orders, helper boundaries, Vec3 ownership, no-op lifetime anchors, negation forms, direct disassembly, allocator snapshots, and two bounded permuter searches. It never found a known exact target-specific checkpoint to restore, the move that closed the exact worker's gap.
- The stall was diagnosable at the category level from its own output: the initial ledger said the sequence was "opcode-identical" and the final report correctly stated, "instruction selection remains aligned." It did not ignore that evidence. It repeatedly targeted allocation and frame shape, although the experiments became less discriminating once many edits returned exactly 99.57658%.
- Loop quality: mixed. It used baselines, reverted regressions, saved best candidates, inspected allocator/disassembly evidence, and ran same-unit regression checks. But long stretches cycled through helper signatures, declaration order, scopes, and equivalent expressions with limited new evidence, and the permuter-generated helper decomposition drove much of the search.

## Transferable technique

- When a target has prior worker or integration history, search the exact symbol across all commits and inspect candidate function bodies before spending many iterations on allocator perturbations.
- When full diff shows opcode identity but register arguments differ, capture allocator coloring and map virtual registers to physical registers before changing source lifetimes, aliases, or inline boundaries.
- Preserve every improved checkpoint and revert each non-improving source-shape experiment immediately; compare against the saved best before final validation.
- After reaching instruction identity, validate with the scorer's configured relocation policy and separately report strict constant-pool symbol-identity differences instead of treating them as code-generation failures.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, past-pr-lookup, permuter, inline-hypothesis, stack-frame-reasoning, checkpoint-restore
