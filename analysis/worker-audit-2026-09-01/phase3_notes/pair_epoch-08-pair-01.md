## Verdict

The main difference was not diagnostic skill: both workers reached an instruction-level explanation of their last gap. The exact worker kept turning allocator evidence into cheap, reversible source-shape experiments until declaration order alone produced the retail registers. The near-miss worker actually built and verified a 100% candidate, but stopped at 99.73475% because that candidate required changing the function and owning-header prototype from `s32` to `void`, and it treated the header as outside its approved write set. Thus the recorded outcome is only partly explained by loop quality; the control worker's self-enforced scope boundary mattered more than lack of a technique.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, but increasingly instruction and register driven. It compared target and candidate disassembly, used allocator/regflow tooling, then reasoned about live ranges and declaration order. Telling lines are: "**Mapping register differences between versions**" and "**Testing declaration order permutations**". It also tried several speculative source shapes, including helper signatures, pointer shadowing, loop forms, and an inline wrapper.
- The decisive move: it first recognized that the natural four-iteration loop was optimizer-unrolled into the desired repeated blocks, so the remaining problem was allocation rather than control flow. After restoring the natural `for` loop, it reordered locals from `idx, text, ch, null_ch, i` to `idx, ch, text, null_ch, i`. Declaring `ch` before `text` changed MWCC's register assignment and immediately flipped 92.91011% to 100%.
- Tool rhythm: inspect source and full asm diff, inspect candidate/reference disassembly and allocator data, edit one source-shape hypothesis, then run `checkdiff_run`; roughly a dozen scored edits are visible, with regressions promptly reverted. Pivotal tools were full checkdiff, objdump/direct compile, MWCC regflow/allocator snapshots, and one 1,000-iteration source-permuter run. Graph, ledger, knowledge, asm-window, and past-PR searches supplied context but did not produce the fix.

## Near-miss worker: why it stalled

- It reduced a broad register-allocation mismatch to one extra terminal `li r3, 0`. It tried helper boundaries, local lifetimes, direct versus helper data access, declaration and return-expression variants, bare fall-through, and automated scratch-build combinations. It never took the exact worker's final operational step of applying the proven type-shape change to the real source plus owning declaration, because it considered `gmregclear.h` outside the write set.
- The stall was fully diagnosable from its own output and was not misread. The transcript says: "sole mismatch is an inserted `li r3, 0`". It verified that coordinated `void` source/header changes scored 100%, confirmed the only caller ignored the result, and explained that the `s32` contract forced return-value liveness. The failure was acting on that evidence, not interpreting it.
- Loop quality: systematic. It made targeted variants, compiled scratch objects, compared instruction words, searched history and callers, reverted regressions, and revalidated neighbors. Repeatedly revisiting the same forbidden header boundary added churn, but the experiments were hypothesis-driven rather than shotgun.

## Transferable technique

- When the diff is dominated by register substitutions, compare target and candidate disassembly, then vary local declaration order and lifetime one change at a time; declaration order can alter MWCC coloring without changing semantics.
- When a natural fixed-count loop compiles into the target's repeated blocks, keep the loop and tune allocator inputs instead of manually duplicating the body.
- When the only remaining instruction materializes a return value, audit the function prototype and every caller; test the source and owning declaration together in a scratch build before spending more time on return-expression tricks.
- After a scratch candidate reaches 100%, either apply every required in-scope declaration change or explicitly escalate the write-set boundary; do not label a proven exact fix as an unsolved codegen problem.

## Flags

- exact_loop: mixed
- control_loop: systematic
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, loop-restructure, inline-hypothesis, scheduling-reasoning
