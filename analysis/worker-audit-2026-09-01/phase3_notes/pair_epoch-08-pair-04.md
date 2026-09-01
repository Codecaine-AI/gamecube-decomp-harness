## Verdict

The exact worker eventually treated the last mismatches as a live-range and helper-boundary problem, while the near-miss worker kept treating its equivalent register-only residue mainly as a declaration-order problem. The exact worker extracted semantic inline helpers, used a permuter once those boundaries existed, and then preserved two distinct `ef4`-related pointers to force the target register lifetimes. The near-miss worker diagnosed register allocation correctly but continued manual local-order permutations. This explains part, not all, of the outcome: both loops were meandering, and the exact worker needed many failed probes before finding the productive abstraction.

## Exact worker: how the gap was closed

- **Diff-reading style:** Mixed. It inspected instructions and register roles, but also tried many source variants. Its late diagnosis was specific: "The residual mismatch is dominated by three extra move/coalescing instructions around GObj_Create and the two decimal-digit loops." It also explicitly pursued "Analyzing register allocation differences in loops" rather than treating the score alone as evidence.
- **The decisive move:** A semantic `CreateCoin` inline first removed mismatches around `GObj_Create` and raised 97.87009% to 98.18731%. A later permuter run found accessor/helper shapes that replayed at about 99.71%; restoring `PAD_STACK(16)` raised this to 99.74320%. Extracting the terminal coin-drop branch into `tyFigupon_FinishCoinDrop` reached 99.92447%. The final edit kept the original `ef4` pointer separate from a newly loaded animation-state pointer inside that helper, changing their live ranges and producing 100%.
- **Tool rhythm:** Roughly 41 `checkdiff` iterations in edit -> build/checkdiff -> inspect -> revert/retain loops, with about 70 edits. Pivotal tools were full asm diffs, hand-parsed objdump comparisons, allocator snapshots, and four permuter runs plus replay. Graph, ledger, knowledge, and past-PR searches provided context but did not supply the winning source. Stack diagnostics confirmed frame concerns were localized; `PAD_STACK(16)` was then validated by score.

## Near-miss worker: why it stalled

- It ended with 24 `DIFF_ARG_MISMATCH` cases: 20 around queued-command and initial `CARDRead` allocation, plus four around a later `CARDRead` buffer/offset pair. It tried declaration order, initialization order, scopes, helper parameters, and removal of locals such as `read_size`, `retries`, `buf`, `write_size`, and `offset`. It never ran the permuter or exhaustively enumerated declaration permutations, and it never found a semantic helper/lifetime split comparable to `FinishCoinDrop` with distinct pointer roles.
- The stall was diagnosable from its own output, and it did not fundamentally misread it: "The remaining target diff is 24 argument/register mismatches." The missed opportunity was after diagnosis. It did not reduce those 24 lines to an explicit register-role constraint table and test source shapes against one role at a time.
- **Loop quality:** Mixed. It gathered strong evidence, mapped target/current disassembly, used allocator snapshots, checkpointed gains, and reverted regressions. The late phase became manual declaration-order guess-and-check. Retained gains progressed 98.96610% -> 99.06780% -> 99.25423% -> 99.32204% -> 99.50848% -> 99.55932%.

## Transferable technique

- When the remaining diff is register-only, map each target and current register to its source role, then change one live range or coalescing relationship per experiment.
- Extract a semantically coherent inline helper around the mismatching region to shorten live ranges; if related values need different target registers, preserve them as distinct typed locals or parameters.
- Run a permuter after manual work has exposed a plausible helper boundary, replay the best candidate, and hand-finish the remaining instruction-level mismatches.
- Validate stack padding against frame instructions and score before changing unrelated control flow.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, inline-hypothesis, stack-frame-reasoning, type-shape-experiments, checkpoint-restore
