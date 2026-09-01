## Verdict

The most important process difference was the exact worker's late pivot from local compiler-shaping experiments to authoritative source recovery. After exhausting declaration orders, operand orders, helpers, allocator probes, and permuter runs, it searched the live upstream PR history, found the accepted exact implementation in PR #3252 / commit `052ccd2`, and transplanted that source shape. The near-miss worker made a strong historical-source recovery of its own, jumping from 98.70026% to 99.60459%, but then remained inside local register-allocation guesswork and stopped without searching for a newer accepted implementation or a broader source-boundary explanation. Process explains the contrast, though the exact worker also benefited from an upstream exact answer being available.

## Exact worker: how the gap was closed

- Diff-reading style: mixed but technically grounded. It repeatedly mapped operand-only differences to concrete FPR roles, instruction regions, and constant relocations, then tested source variants. Examples: "Analyzing FPR register mismatches" and "The projection block needs an f0/f2 swap, while the first distance calculation needs an f0/f5 swap."
- The decisive move was not another register-allocation tweak. After several stalled passes, it explicitly switched to "Planning detailed PR 2313 inspection," queried GitHub, identified PR #3252 and commit `052ccd205fe76088a8370af0a19c47681a1eaa97`, inspected the patch, fetched `lb_020A.c`, and replaced the reconstructed body with the accepted source. That recovered the exact scalar creation and assignment order, PI/average/power expressions, and the unusual `*(f32*) &axis` read. Its own validation said every target instruction then matched; remaining focused differences were translation-unit `.sdata2` ownership, while the audit's runner score reached 100%.
- Tool rhythm: many edit -> `checkdiff_run` loops, well over 50 across several resumed passes. Early and middle work used full disassembly, MWCC regflow/inline/allocator diagnostics, m2c, git history, graph/ledger/knowledge searches, past-PR search, and multiple permuter runs of 1,200 to 6,000 candidates. The pivotal sequence was upstream PR/API search -> inspect exact patch/source -> transplant body -> repeated checkdiff/neighbor checks -> direct compile and lint.

## Near-miss worker: why it stalled

- It first found a high-value structural fix by restoring the function region from commit `78d1645`: caller-owned command buffers, target-local inline helpers, `PAD_STACK`, and stack-slot layout. That raised the score to 99.60459%. It then got stuck on four branch-target offsets, an apparent missing copy, and callee-saved register permutations involving r22/r23 and r17/r18/r19.
- It tried declaration reordering, scoped and unsigned block-count locals, casts, loop forms, condition orientation, helper definition/call shapes, expression reordering, lifetime aliases, two bounded permuter searches, allocator inspection, and repeated checkpoint restores. It never made the exact worker's final move: search outside the local repository/history for a newer accepted exact implementation or test whether the residual came from a larger authored source/function boundary.
- The stall was diagnosable from its diff. It correctly summarized that "The residual is concentrated in a callee-saved register allocation permutation" and noted "One missing copy ... shifts several epilogue branch targets by four bytes." It did not ignore that evidence, but it treated it mainly as a local coloring problem. Once many targeted source-shape variants were no-ops or regressions, that evidence should have triggered source-provenance recovery rather than more allocator nudges.
- Loop quality: mixed. The historical checkpoint and stack-frame analysis were systematic; the long tail became shotgun because many weakly distinguished source variants were tried without a new discriminator.

## Transferable technique

- When a near-exact diff is mostly register operands, map each mismatched register to its source-level value and lifetime before editing; separate register-flow problems from branch-size and relocation problems.
- After a bounded set of source-shape and permuter experiments fails, search accepted upstream PRs and commits for the symbol, renamed source file, address, or neighboring functions, then transplant and validate the known exact authored shape.
- Preserve and restore the best checkpoint before every speculative family of edits; compare each variant against that score and discard no-ops and regressions immediately.
- When all instructions match but constant relocations do not, investigate original translation-unit boundaries and data-pool ownership instead of continuing expression permutations.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: yes
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, checkpoint-restore, inline-hypothesis, stack-frame-reasoning
