## Verdict

The most important difference was how each worker handled the last register/scheduling mismatch. The exact worker built targeted scripts to enumerate source shapes, inspected the emitted instruction sequence, and kept narrowing until only two loop-update instructions were reversed; it then changed the induction expression and update placement to control that schedule. The near-miss worker diagnosed its residue as register coloring, stack placement, and one rewrite-path instruction, but mostly tested isolated declarations, scopes, casts, and assignment orders that repeatedly produced the same 99.69452%. This is a real process edge, though only a partial explanation because both workers used strong diagnostics and broad searches.

## Exact worker: how the gap was closed

- Diff-reading style: mixed early, instruction-level late. It initially tried many source variants, but explicitly followed register evidence: "Analyzing chain assignment register allocation" and, at 97.33334%, "Analyzing single instruction mismatch." The final diff showed only `addi r29, r29, 0x2` and `addi r31, r31, 0x8` in the opposite order.
- The decisive move: custom Python test matrices over address bases, loop scope/form, pointer/index expressions, and update order found a new loop shape with `byte_off = (i * 2 + 1) * 4`. That raised the score to 97.33334% and exposed the two swapped induction updates. The worker then used an explicit `s16* walk`, indexed `walk[i + 0x94]`, and source ordering that made MWCC schedule the updates in target order. The next checkdiff passed at 100%.
- Tool rhythm: roughly 30 edit or scripted-variant batches followed by compile/checkdiff inspection, with frequent restoration after regressions. Pivotal tools were full checkdiff, custom Python enumeration scripts, assembly scans for an analogous prologue, allocator snapshots, past-PR and knowledge searches, and two bounded permuter runs. The generic permuter did not find the answer.

## Near-miss worker: why it stalled

- It ended with branch-target offsets plus mismatches localized to verification pass/result register coloring, completion-command stack placement, and a one-instruction rewrite-path size difference. It tried helper inlining and return shapes, stack padding and command-buffer scopes, variable lifetimes, declaration/assignment order, chunk types, loop forms, allocator/stack diagnostics, historical commits, and a 2,000-iteration permuter.
- It never built the exact worker's kind of focused enumerator around the remaining verification-result register assignment, finish-buffer placement, and rewrite instruction sequence. Its late experiments were mostly one-off source perturbations, many of which reproduced 99.69452% unchanged.
- The stall was diagnosable at a category level from its own full diff and disassembly comparison. It did not ignore that evidence, but failed to turn it into a bounded search over the few source shapes capable of changing each named instruction. Its own final line was accurate: "The residual mismatch is still localized to verification pass/result register coloring, completion-command stack placement, and the one-instruction rewrite-path size difference."
- Loop quality: mixed. The early helper and disassembly work made large, evidence-backed gains to 99.64752% and 99.69452%; the late loop became repetitive guess-and-check around declarations and scopes.

## Transferable technique

- When a full diff collapses to swapped induction updates, rewrite the induction expression and enumerate loop-update placement until MWCC emits the target schedule.
- Build a small custom source-variant matrix for the exact remaining instruction/register pattern; compare emitted opcodes after every candidate instead of relying only on a generic permuter score.
- Search the corpus for a function with the same prologue or register-allocation pattern, then inspect its C source for declaration and initialization shapes worth testing.
- Revert unchanged or regressing variants immediately and preserve the best checkpoint before testing another register-lifetime or stack-scope hypothesis.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, scheduling-reasoning, type-shape-experiments, loop-restructure, permuter, past-pr-lookup, checkpoint-restore, stack-frame-reasoning
