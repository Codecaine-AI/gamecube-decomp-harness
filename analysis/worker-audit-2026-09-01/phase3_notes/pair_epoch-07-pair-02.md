## Verdict

The exact worker kept turning the live instruction diff into increasingly narrow source-shape experiments, especially around register allocation and integer-to-float stack temporaries. The near-miss worker was also evidence-driven and made a large gain, but once only three assertion-string address mismatches remained, it accepted the QA restriction on open-coded `__assert` as the boundary instead of continuing to search for a canonical source shape that placed or reused those strings correctly. Target constraints mattered, so process explains the outcome only partially, but the exact worker's last-mile loop was more persistent and discriminating.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level and register-allocation driven, with source variants chosen to alter specific live ranges. Examples: "**Mapping current to target registers**" and "**Tracing register mismatch in arithmetic and storage**". It did use guess-and-check edits, but the guesses followed observed register and stack-slot differences.
- The decisive move: first it introduced a shared `third = arg3 / 3` local and scoped typed `GXColor*` temporaries, reaching 99.79127%. Moving `left_third_color = line_color` before the division changed allocation and reached 99.96262%. The remaining diff was a swap among stores and loads for integer-to-float conversion temporaries. Removing the local `f32 y = arg5` and passing `(f32) arg5` inline changed temporary allocation and produced 100%.
- Tool rhythm: roughly 18 edit-to-`checkdiff_run` experiments, with frequent reversions after regressions. Pivotal support came from direct object compilation and `objdump` side-by-side assembly, allocator snapshots, register-flow and stack diagnostics, git history, ledger and past-PR searches. Two permuter runs failed to improve the result; the exact finish was manual.

## Near-miss worker: why it stalled

- It first got stuck on `mnInfo_804A0958` BSS placement and `lbArchive_LoadSections` argument scheduling. A typed `StaticModelDesc*`, `top_joint`, and `animjoint` locals eventually fixed that region. The final stall was three `addi` instructions addressing HSD assertion strings at the wrong `.data` offsets. It tried declaration order, alignment, zero initialization, removing definitions, packed-layout changes, inline literals, field-backed strings, an inline allocation helper, canonical assert macros, and one permuter run.
- The stall was diagnosable from its own diff. It explicitly concluded: "only three HSD_ASSERTREPORT-generated literal relocation offsets remain" and identified the candidate and target offsets. It did not ignore the evidence, but it framed open-coded `__assert` as the only exact route and stopped after nearby layout/helper experiments regressed. It never reduced those last three address mismatches one at a time with the exact worker's tight instruction-to-source-allocation loop, nor used checkpointed restoration to preserve the 99.88461% two-mismatch state while exploring further.
- Loop quality: mixed. The typed-local scheduling work was systematic and produced clear jumps to 99.57692%, 99.88461%, and 99.82692%. The BSS/string-layout phase sprawled across many repeated builds and broad declaration/data-layout variants, sometimes issuing duplicate checks, with weaker isolation of one mismatch per experiment.

## Transferable technique

- When the diff shows only register or stack-slot argument mismatches, map target and candidate registers, then change one local's lifetime, declaration order, scope, or inline form per build.
- Preserve every new high-score source shape before experimenting; restore that checkpoint immediately after a regression so later hypotheses start from the best known allocation graph.
- When a helper call's arguments are scheduled differently, introduce typed base and field-pointer locals in the target evaluation order, then verify the exact changed instructions rather than relying only on the percentage.
- When only literal relocations remain, list each target and candidate offset and test one canonical string-ownership or source-placement hypothesis at a time; do not treat a rejected raw expansion as proof that no compliant equivalent exists.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, stack-frame-reasoning, checkpoint-restore, inline-hypothesis
