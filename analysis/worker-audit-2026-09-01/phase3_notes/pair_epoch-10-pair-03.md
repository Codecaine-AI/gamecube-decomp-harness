## Verdict

The exact worker's main process advantage was decomposing the residual diff into independent register-allocation clusters and locking down each cluster before attacking the next: it moved the GPR-only car-count loop behind an inline helper, observed that only the two FPR clamp regions remained, then tuned declaration order and stack shape together. The near-miss worker also read instructions, used allocator/history tools, tried helpers, and found a real improvement, so this is not a stark systematic-versus-random contrast; however, after reaching 99.85714% it kept cycling overlapping pointer/helper variants around the same seven opening instructions without converting the known r5/r6/r7 live-range requirements into a bounded experiment matrix. Outcome is therefore partially, not wholly, explained by process.

## Exact worker: how the gap was closed

- **Diff-reading style:** Instruction-level register reasoning dominated, with source experiments chosen to alter allocation rather than arbitrary syntax. Representative lines: “**Analyzing register allocation differences**” and “**Refactoring helper to encapsulate manager and cars**.” It explicitly mapped the first cluster to manager/count/pointer in r6/r4/r5 and the later clusters to the clamp value in f29 versus candidate f31.
- **The decisive move:** First, `grBigBlue_CountCars(void)` isolated the three-car loop and raised 99.76649% to 99.95330%, eliminating the GPR cluster. It then scoped `check_pos` locally and adjusted padding to reach 99.95879%. Finally it declared the camera temporaries before each branch-local `target` and `delta`, saw the expected saved-FPR/frame change, and changed `PAD_STACK(48)` to `PAD_STACK(56)`; that flipped checkdiff to 100%.
- **Tool rhythm:** Roughly 45-55 edit -> focused full checkdiff iterations across the whole transcript, with frequent clean restores after regressions. Pivotal tools were direct compilation plus PowerPC objdump for prologue/register verification, allocator snapshots, full instruction diffs, history/PR/ledger searches, and two permuter runs (600 and 1,000 iterations) that found no decisive improvement. It validated the target, neighboring functions, direct compile, lint, and diff cleanliness after the pass.

## Near-miss worker: why it stalled

- It remained stuck in the opening seven-instruction pointer setup: reference retained the global base in r5, formed config/config->x4 in r6/r7, loaded through r5, and formed the mode-data base as global+0x588; candidate used r4 for global/value, stored through 4(r6), and derived the later base as config+0x6C. It tried statement/declaration reorderings, direct-global versus casted overlays, explicit pointers, many helper signatures/argument orders, allocator capture, history/PR searches, and several permuter runs.
- It did find one useful abstraction: an inline `gmMainLib_AdjustNameTag` improved 99.76262% to 99.85714%. What it never tried from the exact worker's successful playbook was isolating the *entire coupled opening region*—nametag adjustment plus the later base formation—behind one source boundary, then checkpointing that shape and enumerating only live-range/declaration-order changes against the r5/r6/r7 map. Its helpers repeatedly isolated only the byte adjustment or pointer getter.
- The stall was diagnosable from its own diff and disassembly; its final statement precisely says, “**Seven opening instruction differences remain**.” It did not ignore the evidence, but it underused it: experiments were often overlapping rewrites without a recorded hypothesis/result table, and regressions were repeatedly revisited.
- **Loop quality:** mixed. The investigation was technically informed and focused on the right region, but the long tail became shotgun-like helper/pointer permutations.

## Transferable technique

- When residual diffs split into register-allocation clusters, isolate one cluster behind an inline helper; rerun the full instruction diff and keep the helper only if that cluster disappears without creating new ones.
- Translate each mismatched register into a source live range (base pointer, derived pointer, counter, clamp value), then enumerate declaration order, scope, and reuse variants one variable at a time while recording score and changed cluster.
- After a source-shape change fixes register allocation but changes the prologue, inspect the compiled prologue/local offsets directly and tune `PAD_STACK` only after the live ranges are correct.
- Treat permuter and past-PR results as hypothesis generators; if they do not improve the score, return to the best checkpoint instead of continuing adjacent untracked variants.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning, permuter, past-pr-lookup, checkpoint-restore
