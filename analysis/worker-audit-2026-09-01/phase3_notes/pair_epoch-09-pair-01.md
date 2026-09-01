## Verdict

The most important process difference was not diff literacy or tool access. Both workers localized register-allocation failures and tried many source shapes. The exact worker found a compiler mechanism that explained several mismatches at once, then kept restructuring the helper boundary until it deliberately created the missing GPR pressure, persistent `r30` base, contiguous `r31/r30` saves, and stack frame. The near-miss correctly isolated its last `f0`/`f1` swap but never gained equivalent visibility or control over FPR coloring, so its experiments became less discriminating. Process explains the outcome only partially because the control's remaining mismatch was both smaller and less observable.

## Exact worker: how the gap was closed

- **Diff-reading style:** Instruction and register specific, followed by targeted source-shape tests. It wrote, "The reference uses one persistent r30 base for every handicap store and retains otherwise-dead r31 plus r30 saves." It then refined the interpretation: "the target's otherwise-unused r31 save is a contiguous-save artifact caused by the live r30 base, not evidence for a separate dead r31 local."
- **The decisive move:** The worker saw that ordinary loops and pointer walks lost the target frame and nonvolatile saves, while the current helper made separate volatile pointer webs. A matched `lbArq_80014D2C` analog and allocator captures suggested that temporary argument pressure could force a base into `r30` and leave contiguous saves. It built a typed local overlay rooted at the evidenced `0x588` layout, then passed six fixed `PlayerInitData*` arguments to an inline helper and used a chained handicap assignment. As its final note states, "Passing the six player pointers recreates MWCC's otherwise-missing register pressure, producing the reference r31/r30 saves and persistent r30 base." With that allocation, `PAD_STACK(0x90)` also produced the reference `0xC8` frame, flipping the function to 100%.
- **Tool rhythm:** Roughly edit -> `checkdiff` -> inspect asm or allocator -> revise, at very high volume: about 98 edits, 93 `checkdiff_run` calls, nine allocator snapshots, and four permuter runs. Pivotal evidence came from `mwcc_alloc_snapshot`, objdump/reference-asm inspection, and the matched `lbArq` compiler analog. Past-PR/history retrieval showed PR #2754's loop shape was insufficient. Permuter, graph, ledger, knowledge, and asm-window searches narrowed or rejected ideas but did not produce the exact form.

## Near-miss worker: why it stalled

- It ended with one localized target-code mismatch: `frame_speed_mul` and `itemthrow4.x8.x` occupied the opposite `f0`/`f1` registers around `fdivs`/`fsubs`; checkdiff also showed pre-existing small-data relocation-label differences. It tried declaration order, scopes, temporaries, arithmetic spellings, interpolation placement, helper boundaries, parameter order and types, linkage, allocator/debug inspection, history searches, and three permuter runs of 1,500, 5,000, and 4,000 iterations.
- It never obtained an FPR coloring capture after discovering that the available allocator capture exposed GPRs. That is the missing part of the exact worker's playbook: acquire a discriminating allocator model, then design source pressure from it. It did not omit instruction-level diffing, inline hypotheses, type-shape experiments, past-PR lookup, or permuter use.
- The stall was diagnosable and correctly diagnosed from its own diff. Its final handoff says, "The only target instruction mismatch is the localized f0/f1 allocation swap for frame_speed_mul and itemthrow4.x8.x around fdivs/fsubs." It did not ignore the evidence; it lacked a tool or source transformation that could selectively alter that FPR coloring.
- **Loop quality:** Mixed. The worker usually ran edit -> full checkdiff and reverted regressions, but about 53 edits and 56 checks included duplicate validations and increasingly repetitive equivalent-expression probes. Scores oscillated widely before returning to the retained near-match.

## Transferable technique

- When a diff shows a persistent nonvolatile base plus apparently dead contiguous saves, treat the saves as an allocator side effect; inspect coloring and create the live-range or argument pressure that would force the base into that register.
- When loop, frame, and save mismatches move together, search matched functions for an analogous compiler pattern and test its helper boundary or unrolled pointer shape before enumerating cosmetic expressions.
- After localizing a final register swap, obtain allocator evidence for the relevant register class. If the capture only covers GPRs while the mismatch is in FPRs, record that limitation and avoid repeating source variants that produce identical coloring.
- Use each full diff to define one compiler hypothesis and one bounded source-shape experiment; checkpoint the best candidate before exploring a different hypothesis.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, inline-hypothesis, stack-frame-reasoning, checkpoint-restore
