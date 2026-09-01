## Verdict

The most important difference was hypothesis quality and information reuse. The exact worker searched the symbol ledger and past PRs at the outset, got the specific lead that local types and declaration order had matched this function before, and converted that into one high-leverage `JObjIndices` type-shape edit. The near-miss worker read the assembly carefully, but kept testing variations of the already-known stack/register-allocation hypothesis. It changed scope, declaration order, padding, and helper-local lifetimes without finding a new source construct that explained the missing `r25` lifetime. Process explains part of the outcome, though the exact worker also had unusually direct historical evidence for its target.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, but evidence-led rather than blind guess-and-check. It noticed register and data-reference mismatches, then used historical search to constrain the source experiment. Its reasoning says, "**Analyzing argument register mismatches**" and then "**Refactoring pointer to union typed variable**."
- The decisive move: `ledger_search` reported that this symbol had been matched by correcting local types and declaration order, and `past_prs_search` found PR 2790. After inspecting `mn_804DBDFC`, the worker changed the four-byte array and its stack copy from `u8` shapes to the existing `JObjIndices` union and walked its typed byte view. That single edit moved 92.7% to 99.8% with every instruction matching. The remaining four differences were only literal-pool relocation identities. Trial source definitions for the constants did nothing and were reverted; runner-side data-value relocation validation supplied the reported 100% result.
- Tool rhythm: one broad diagnostic pass using full checkdiff, graph, ledger, and past-PR search; repository/history inspection; one decisive edit followed by checkdiff; one failed constant-definition edit and revert; final checkdiff and naming cleanup. Roughly three edit/checkdiff cycles. No permuter was used.

## Near-miss worker: why it stalled

- It got stuck on a coupled allocation mismatch: target `stmw r25, 0x74(r1)` versus current `stmw r26, 0x78(r1)`, plus different stack homes in inlined channel and volume animation code. It tried function-scope promotion, declaration reordering, `PAD_STACK` compensation, helper-local ordering, a longer-lived `Menu`, nested scopes that shortened `Vec3` lifetimes, direct reference/current disassembly, and several 300 to 600 iteration permuter runs.
- It never found or tested a semantically justified extra long-lived value that would occupy `r25` while preserving the `0xA0` frame. It also did not find a target-specific past PR that supplied the missing source shape, the main shortcut in the exact worker's playbook.
- The stall was diagnosable at the level of symptom, and the worker read it correctly. It wrote, "the reference saves r25–r31 while current code saves r26–r31." The evidence did not identify the needed C construct, however. Repeated diagnostics kept returning the same 24 allocation mismatches, yet the search stayed centered on broad scope and declaration variants.
- Loop quality: mixed. The assembly comparison, neighbor checks, reversions, and retained nested-scope improvement were systematic. Repeating near-equivalent scope probes and broad permuter searches without a sharper register-lifetime hypothesis was shotgun behavior.

## Transferable technique

- Search the symbol ledger, past PRs, and git history before source mutation; turn any target-specific type or declaration-order lead into the first experiment.
- When a byte table is copied or walked and the diff shows widespread register drift, test an existing packed union or struct type for both the global and stack local before rewriting control flow.
- When the prologue differs by one saved register, map the value that must remain live across the affected calls, then test one source shape that creates that lifetime while separately preserving frame size.
- After a stack-layout edit, check the target and inlined-helper neighbors, and revert immediately if the target is unchanged or a neighbor regresses.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, past-pr-lookup, type-shape-experiments, stack-frame-reasoning, permuter, checkpoint-restore
