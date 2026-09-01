# Worker-audit Phase 3: epoch-11-pair-04

## Verdict

The exact worker's main advantage was hypothesis completeness: before editing, it reconstructed the entire `.data` layout from target/current bytes, symbol sizes and binding, relocation offsets, string placement, and the compiler-generated jump table, then made one coordinated layout edit. The near-miss worker also read assembly carefully, but after identifying stack-slot and FPR-allocation differences it mostly searched local declaration, lifetime, assignment, and expression shapes one at a time. That process found small gains but never produced a full allocator model. Process explains part of the split, but target form matters too: a missing data section can be copied and ordered deterministically, while the last 0.35% of a 1,385-line function depends on coupled MWCC allocation decisions.

## Exact worker: how the gap was closed

- Diff-reading style: it did not guess source variants. It compared object-level structure and reasoned about offsets and compiler output. Its notes say, **"Analyzing compiler jump table placement"** and **"Verifying precise data section ordering"**. It inspected `.data` hex, `nm` symbols, `.rela.data`, target disassembly, section sizes, and historical source before editing.
- The decisive move: it made the training item table file-local, restored four resource strings and all 65 `ClassicStageEntry` records, and reordered definitions so the generated jump table landed at target offset `0x7c` rather than the current relocation cluster near `0x48c`. The chain was: target `.data` was exactly `0x4f8` bytes; symbol and relocation dumps exposed the target order; the jump-table relocations identified the compiler-owned block; strings and the 65-entry table accounted for the remaining ranges; storage-class inspection showed `lbl_803D9828` was local. One coordinated edit then scored 100%.
- Tool rhythm: broad read-only investigation, one main edit, direct compile, candidate score, full Ninja rebuild, objdiff, and regression checks. Roughly one substantive edit/build/check cycle reached 100%, followed by naming and lint cleanup cycles that repeatedly confirmed `.data` stayed exact. Pivotal tools were `objdump`, `objcopy`, `nm`, `readelf`, objdiff JSON, git history, graph/ledger searches, and past-PR search. It did not use the permuter.

## Near-miss worker: why it stalled

- It got stuck on coupled stack-slot allocation for bitwise float absolute-value temporaries and a small `cur_angle`/FPR window. It tried matrix-store order, expression reassociation, chained assignment order, declaration order, function-scope versus block-scope temporaries, `vf32`, `fabsf`, dedicated absolute-value locals, staged intermediates, allocator snapshots, and two bounded permuter runs. It never stopped to derive a complete source-to-stack-slot/lifetime map for all remaining offsets before further edits, which is the exact worker's strongest transferable habit.
- The stall was diagnosable in broad shape, but not uniquely solvable, from its own diff. It explicitly mapped target/current instructions such as `R stfs f1,120(r1) C stfs f1,356(r1)` and later narrowed the residue to offsets `0x7c`, `0x78`, `0x6c`, `0x68`, and `0x64`. It did not ignore this evidence; it overinterpreted individual declaration changes as isolated controls even though many experiments changed the frame prologue and large allocator regions. The telling self-description is **"Planning precise local tmp variable placement"**.
- Loop quality: mixed. The worker used instruction-level diffs, disassembly windows, direct compiles, allocator diagnostics, checkpoint-like manual reversions, and measured every retained gain. But repeated multi-site edits, compile failures, and large regressions to 95.93% or 99.03% show a partly shotgun search once local stack hypotheses stopped isolating one variable.

## Transferable technique

- Before editing a data target, account for every byte range with section dumps, symbol sizes/binding, relocations, strings, and compiler-generated tables; make the edit only after the proposed layout covers the full section.
- When remaining diffs are stack offsets, build a source-variable-to-target-slot table with live ranges, then change one lifetime or declaration at a time; reject experiments that alter the frame prologue unless that is the stated hypothesis.
- Preserve the best measured source state after every improvement, and immediately revert any mutation that expands a local mismatch into frame-wide register or stack changes.
- Use a bounded permuter only after narrowing the mismatch to a specific expression or declaration; replay its winning mutation and verify the exact instruction window before retaining it.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, checkpoint-restore, stack-frame-reasoning, scheduling-reasoning
