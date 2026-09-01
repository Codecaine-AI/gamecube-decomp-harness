## Verdict

The exact worker's key process advantage was recognizing when the mismatch class had changed and switching tools: after a source-shape change fixed the broad r26/r28 register swap, it saw that "instructions match but relocation/data references still differ" and used the purpose-built `.sdata2` ordering repair. The near-miss worker diagnosed its lone late-scheduler reorder at least as deeply, but had no analogous targeted repair and continued searching source variants. Thus process explains the final split only partially; the exact worker made a crisp evidence-led tool switch, while the control faced a mismatch for which the transcript exposed no reliable repair.

## Exact worker: how the gap was closed

- Diff-reading style: mixed but strongly instruction-led. It tracked the r26/r28 swap through specific `addi` and `lwz` mismatches, inspected allocator coloring, then separated instruction equality from relocation equality. Its own summary says it was "correcting the r26/r28 allocation" and later that "instructions match but relocation/data references still differ." It also tried many declaration/helper variants rather than deriving every edit directly from an instruction.
- The decisive move had two stages. First, a related solved idiom suggested replacing separate `slot`, HUD-color, and `team` temporaries with a nested player-color call. That removed the register-allocation mismatch and reached 99.94872%, leaving only `@734/@735` versus `@738/@739` `.sdata2` references. Second, `review_lint_sdata2_order_helper` previewed, generated, and validated `ifStatus_Sdata2Order`; checkdiff then reported 100%. Removing the helper returned the score to 99.94872%, and restoring it reconfirmed causality. A later continuation removed it again because a hard gate considered the helper banned, but the recorded 100% checkpoint came from this move.
- Tool rhythm: about 30 edits and 29 checkdiff runs, usually edit -> checkdiff -> revert or retain. Pivotal tools were `mwcc_alloc_snapshot` plus allocator JSON inspection, objdump/readelf, graph/ledger and past-PR searches for analogs, and the `.sdata2` ordering helper. Two permuter runs, roughly 3,000 and 5,000 iterations, did not help.

## Near-miss worker: why it stalled

- It was stuck on one ordering difference: the reference emitted two `xoris` instructions before `stw r3, 0x6c(r1)`, while the candidate placed the store between them. It tried row/column temporaries, types, casts, declaration and evaluation order, helper signatures and boundaries, loop shapes, stack padding, compiler flags, donor patterns, hundreds of scripted variants, and repeated permuter runs. What it never found or applied was the exact worker's final kind of move: a dedicated, validated repair for the remaining mismatch class. There is no evidence that a scheduler-order counterpart to the `.sdata2` helper was available.
- The stall was diagnosable, and it diagnosed it correctly rather than ignoring the diff. The strongest line is: "Before scheduling, PCode block 61 already has the retail xoris r3 / xoris r0 / stw r3 order. The scheduler changes it to xoris r3 / stw r3 / xoris r0 because the first conversion's r3 allocation creates dependencies..." Allocator snapshots and live GDB tracing localized the divergence to the late scheduler, not stack layout or initial PCode order.
- Loop quality: mixed. Most cycles tested one explicit hypothesis, ran checkdiff, and reverted regressions. Late in the transcript the search broadened into hundreds of speculative expression, naming, pragma, layout, and helper variants plus repeated permuter sweeps.

## Transferable technique

- When a broad register swap remains, trace the mismatched `addi`/load operands through allocator snapshots, then search matched sibling code for an equivalent nested-call shape that shortens temporary lifetimes.
- After every meaningful edit, run full checkdiff and classify what remains as instruction, register, scheduling, or relocation/data identity differences before choosing the next tool.
- When all instructions match but `.sdata2` relocation identities differ, preview and validate the repository's constant-order repair tool; remove and reapply its output once to prove that it alone causes the exact match.
- When PCode order matches the reference but final assembly order does not, inspect the late scheduler and compare an exact donor's dependencies before spending more iterations on stack-layout or register-allocation edits.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, scheduling-reasoning, permuter, past-pr-lookup, type-shape-experiments, inline-hypothesis, stack-frame-reasoning, loop-restructure, checkpoint-restore, sdata2-order-repair
