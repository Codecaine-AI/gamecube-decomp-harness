## Verdict

The exact worker escaped register-allocation guesswork by turning a concrete historical clue into a source-shape hypothesis: a suspicious chained assignment proved that one extra compiler boundary could fix allocation, then a plausible inline JObj loader reproduced the same 100% codegen. The near-miss worker diagnosed its allocation cycle in greater depth and made a real improvement, but kept perturbing aliases, scopes, parameter order, offsets, and declarations around the whole inlined body. It did not isolate the final `Ground` load behind a purpose-built inline accessor. Process explains part, not all, of the outcome: the near-miss target had a more coupled allocation problem, but its last-stage search was less sharply localized.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, with instruction/register reasoning directing source experiments rather than blind variants. It explicitly wrote **"Mapping exact register roles"** and **"Analyzing redundant double assignment impact"** after comparing retail and candidate assembly.
- The decisive move: `git` history exposed an earlier `gobj = gobj = GObj_Create(...)` shape. Testing that exact oddity immediately changed 98.8674% to 100%, proving the gap was allocation/coalescing, not semantics. The worker rejected the artifact as implausible, tried helper boundaries, and found that `ifStatus_LoadDamageJObj(hud)` around `HSD_JObjLoadJoint(hud->unk258)` preserved clean source while producing the same 100% result.
- Tool rhythm: initial `checkdiff` plus graph, ledger, and past-PR searches; assembly/object inspection; roughly 7 focused edit-to-`checkdiff` trials; one 500-iteration permuter run; then duplicate 100% checks, neighbor checks, lint, and `git diff --check`. History search was pivotal. The permuter was not.

## Near-miss worker: why it stalled

- It got stuck on a coupled callee-saved-register coloring cycle, ultimately reduced to retail loading `user_data` through `r6` before copying to `r31`, while the candidate loaded directly into `r31`. It tried helper parameter permutations, declaration orders, scoped aliases, signedness, casts, no-op lifetime extensions, explicit byte offsets, a union overlay, stack padding, pointer reuse, and several permuter runs.
- It never tried a small, purpose-built inline `Ground*` accessor around the final initial load, the direct analogue of the exact worker's successful inline loader. It tried `GET_GROUND`, direct casts, aliases, and broader helper refactors, but not that isolated compiler-boundary hypothesis.
- The stall was diagnosable from its own diff and it did diagnose it. Its final line was: **"Only the initial Ground setup remains: retail loads user_data into r6 and then copies it to r31, while the candidate loads it directly into r31."** The failure was not ignored evidence; it was failure to convert precise evidence into one last narrow source-shape experiment.
- Loop quality: mixed. Allocator snapshots, disassembly, history, and rollback were systematic. The long sequence of alias/cast/scope/index variants became shotgun, with many low-information edits before each score check.

## Transferable technique

- When a diff is dominated by register substitutions, map each persistent source value to its retail and candidate register before editing source.
- Search local history and past PRs for prior shapes, then test the smallest suspicious shape once as a diagnostic even if it is not acceptable final C.
- If an ugly diagnostic shape reaches 100%, preserve the compiler boundary with a plausible one-operation inline helper and verify that it gives identical codegen.
- When only one load or move remains, isolate that expression behind a tiny inline accessor before changing aliases, scopes, or the surrounding function again.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, inline-hypothesis, stack-frame-reasoning, checkpoint-restore
