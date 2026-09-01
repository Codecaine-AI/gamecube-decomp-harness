## Verdict

The most important process difference was the granularity of the final experiments. The exact worker converted specific register-lifetime evidence into a narrowly scoped inline-helper and declaration-order hypothesis, then kept reshaping that boundary until the compiler reused the target registers. The near-miss worker correctly localized its last error to nested-loop exit lowering, but mostly tested whole-loop rewrites that disturbed otherwise matching code. This explains part, not all, of the outcome: the near-miss worker was also instruction-aware and persistent, and its residual control-flow problem was less locally controllable than the exact worker's register-allocation problem.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level and register-aware, although it also used controlled source-shape experiments. Its reasoning explicitly says, "**Diagnosing register coalescing mismatch**" and later "**Identifying reused gobj register r30**". It inspected target and candidate disassembly, stack-frame changes, helper symbols, and mismatched `mr`/`addi` register assignments rather than treating score alone as the signal.
- The decisive move: it combined the 16-entry GObj initialization and stock-object creation in one focused inline helper, with `stock`, `gobj`, `jobj`, and the loop index declared in an order that let the compiler coalesce the loop GObj and later object GObj into the expected register. Earlier observations had shown that a parameterized init helper reached 99.90228% but left `r30`/argument-register mismatches, while merging or splitting helpers carelessly changed the stack frame or regressed allocation. The combined helper produced 99.96743% locally with every instruction matching; only two `Stc_scemdls` relocation references differed under that checker, while the runner's relocation configuration scored the same code shape at 100%.
- Tool rhythm: roughly 23 `checkdiff_run` cycles, usually edit -> full diff, with periodic direct TU compilation and objdump inspection. It used ledger and knowledge searches to recover prior helper-shape evidence, assembly-window search, past-PR search, graph lookups, and same-unit summaries. The pivotal work was manual helper-boundary and declaration-order testing, not the permuter.

## Near-miss worker: why it stalled

- It got stuck on the closest-car 2x2 loop exit. The candidate emitted an extra `cmpwi`/`bne` before `bdnz` and different branch targets. It tried natural four-car, manually paired, countdown `do-while`, loop-condition, outer-counter mutation, flag type/condition, and break variants. These generally caused large regressions and were reverted. A source-permuter run was attempted but failed because the function was not found at the tool's source path; it never repaired that invocation or narrowed permutation to the isolated exit expression.
- The stall was diagnosable from its own diff and it did diagnose it. Its final report says, "The current natural 2x2 loop emits an extra cmpwi/bne before bdnz". The miss was not ignored evidence. The weaker step was translating that evidence into experiments: it did not isolate the exit into a small inline helper or use declaration/lifetime reshaping around `found_ten`, the way the exact worker isolated allocation-sensitive regions.
- Loop quality: mixed. Early reconstruction and accessor/type work was systematic and reached a gate-clean 99.55617%. Late work became broad guess-and-check across control-flow forms, with repeated large regressions and restores. It did use checkpoints responsibly and rejected a higher 99.62552% checkpoint because it contained disallowed inline assembly.

## Transferable technique

- When a diff differs mainly by registers, inspect candidate and target disassembly and map each register's lifetime back to locals; then test declaration order and helper boundaries that let the compiler coalesce those locals.
- When extracting inline helpers, change one boundary at a time and watch the prologue, stack-frame size, and saved-register set before interpreting downstream mismatches.
- When only a loop exit differs, preserve the matching loop body and isolate experiments to the flag, break condition, or a small inline helper; avoid replacing the entire loop unless the branch graph demands it.
- After a large regression, restore the best checkpoint immediately. Keep a higher-scoring checkpoint only if it also passes the source-quality gates.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, type-shape-experiments, loop-restructure, checkpoint-restore, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning
