## Verdict

The exact worker kept converting object evidence into a concrete data-layout model, while the near-miss worker shifted from good diagnosis into increasingly broad source-shape experiments. That process difference mattered: the exact worker used section bytes, symbols, relocations, alignment, and declaration order to determine what to write, then fixed each remaining byte-range discrepancy. The near-miss worker correctly reduced its problem to one `r3` versus `r4` temporary-register choice, but continued changing linkage, pointer timing, helper shape, unions, types, and stack padding without a comparably tight hypothesis for that last register. Outcome is only partially explained by process, because reconstructing static data is more directly constrained than reproducing MWCC register allocation.

## Exact worker: how the gap was closed

- Diff-reading style: evidence-led reconstruction, not blind source permutation. It inspected `.data` bytes and relocations, mapped them onto `ftCo_803C6594_t`, and tracked exact section size. Its reasoning explicitly says, **"Mapping struct fields with correct types"** and later **"Analyzing table size discrepancy"**.
- The decisive move: it replaced two zero placeholders with one aligned array of eleven linked records plus the stage lookup table, moved those definitions after the functions so generated jump tables stayed in retail order, then added a 151-pointer zero tail to reach the target's 2048-byte section. The chain was: raw dump and symbol addresses identified record boundaries, relocation targets exposed links and lookup entries, the first reconstruction reached the right content but wrong size/order, and the final tail plus placement made `.data` 100%.
- Tool rhythm: roughly inspect object/asm/source, edit, compile with `ninja` or `checkdiff_run`, inspect `objdiff` JSON, then refine, across about 6 substantive edit/build/diff rounds. Pivotal tools were `readelf`, `nm`, `objdump`, raw-byte/JSON scripts, symbol/config searches, and an initial past-PR/ledger search. It did not use the permuter.

## Near-miss worker: why it stalled

- It got stuck after `grPushOn_80219204`: the target loads `coin_count` with `lwz r4, 0x58(r1)` and truncates from `r4`, while the candidate uses `r3`. Before that, it solved larger state-base, stack-frame, type, and relocation-shape cascades with a typed state/model union, `int` output locals, cast removal, and `PAD_STACK(0x18)`.
- It tried static/global/extern linkage, assignment timing, pointer aliases, self-assignment, helper extraction, union/array/scalar local shapes, declaration and expression variants, padding changes, historical commits, MWCC diagnostics, direct disassembly, and 500- plus 1000-iteration permuter runs. It never turned the final two-instruction window into a small, explicit register-allocation experiment matrix with one change per build and a recorded score/diff for each candidate, which is the exact worker's evidence-to-single-hypothesis discipline.
- The stall was diagnosable from its own diff. Its final summary states: **"The remaining official mismatch is one temporary register choice"**. It did not ignore that evidence, but many subsequent trials perturbed the prologue, relocations, or frame rather than only the live range feeding those two instructions.
- Loop quality: mixed. Early work was systematic and instruction-aware; the late loop became shotgun, including repeated identical `checkdiff_run` calls and unrelated-shape regressions, though it restored the best retained form.

## Transferable technique

- Dump section bytes, symbols, and relocations before editing data; derive record boundaries, pointer links, alignment, declaration order, and required zero tail from those artifacts.
- After each data edit, compare section size and relocation diffs, not only match percentage; treat a remaining inserted/deleted byte range as a precise layout constraint.
- When only source registers differ, freeze every already-matching structural choice and enumerate one minimal live-range or expression-shape change per compile, recording the exact changed instruction window.
- Use the permuter only after constructing a near-exact source shape from instruction-level evidence, and restore the best checkpoint when a trial changes the frame, prologue, or unrelated relocations.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, checkpoint-restore, stack-frame-reasoning
