# Worker-Audit Phase 3 Rollup

All 44 pair reports are included. Pair citations use `03-02` as shorthand for `epoch-03-pair-02`; citation ranges are inclusive.

## Scoreboard

| Worker | systematic | mixed | shotgun | Total |
|---|---:|---:|---:|---:|
| Exact | 20 | 24 | 0 | 44 |
| Control | 7 | 37 | 0 | 44 |

| `outcome_explained_by_process` | Count |
|---|---:|
| yes | 7 |
| partial | 36 |
| no | 1 |

| Technique slug | Count | Technique slug | Count |
|---|---:|---|---:|
| `asm-diff-instruction-level` | 44 | `permuter` | 40 |
| `register-allocation-reasoning` | 40 | `past-pr-lookup` | 39 |
| `type-shape-experiments` | 39 | `checkpoint-restore` | 36 |
| `stack-frame-reasoning` | 35 | `inline-hypothesis` | 32 |
| `scheduling-reasoning` | 24 | `loop-restructure` | 10 |
| `float-literal-tricks` | 4 | `binary-section-byte-comparison` | 1 |
| `bss-emission-order-reasoning` | 1 | `data-layout-reconstruction` | 1 |
| `data-section-layout` | 1 | `literal-pool-ordering` | 1 |
| `sdata2-order-repair` | 1 | `sdata2-ordering` | 1 |
| `section-byte-forensics` | 1 |  |  |

There are 351 technique assignments across 19 slugs. Every Flags block was complete and valid; no report used `shotgun`.

## Consistent differentiators

These behaviors are ranked by conservative report-level support. They are not universal: `03-01` reverses the nominal exact/control advantage, `11-06` reaches 100% in the control transcript, and many epoch 11 and 12 exact targets were more directly invertible than their allocator-heavy controls.

### 1. Convert the residual into a predictive compiler hypothesis

**Support: 23 reports.** `03-02,03-03,03-04,03-05,06-01,06-02,07-01,07-02,07-03,08-01,08-02,08-03,08-05,09-03,10-02,10-03,10-05,11-01,11-02,12-02,12-04,12-05,12-06`.

Exact workers more often mapped the differing instruction, register, slot, or byte range to a specific compiler mechanism, then tested only the source shapes predicted to move it.

> "The exact worker's main advantage was closing the loop between individual asm mismatches, MWCC allocator evidence, and narrowly targeted source-shape searches." (`06-02`)
>
> "The exact worker made the search space concrete before editing: it turned a 24-byte `.data` size deficit into one missing object at one known offset, then verified bytes and relocations." (`12-02`)

**Counterexample:** The `03-01` control was more systematic and found an exact but gate-rejected mechanism. The `12-05` control also diagnosed its allocator preference correctly and exhausted reasonable probes without finding a controllable source lever.

### 2. Escalate from local syntax to authored structure

**Support: 15 reports.** `06-04,07-03,07-04,08-03,08-04,08-05,08-06,09-01,09-05,09-06,10-01,10-02,10-03,10-06,12-03`.

After local declarations, casts, and expression forms plateaued, exact workers more often changed the lifetime topology through a semantic helper, inline boundary, indexed access, owner/subobject model, or call shape.

> "The exact worker eventually changed the abstraction boundary instead of continuing to perturb locals" (`06-04`)
>
> "The exact worker's main advantage was that it eventually stopped treating a register-only diff as a collection of local allocation accidents and reconstructed the likely authored abstraction boundaries from already-matched animation traversals." (`08-06`)

**Counterexample:** The `11-06` control eventually made the structural move itself, using a dedicated pointer and fixed post-increment stores, and reached 100%.

### 3. Switch from C code shape to object and section evidence

**Support: 15 reports.** `03-04,03-05,03-06,07-05,09-03,09-04,10-06,11-01,11-02,11-03,11-04,11-05,11-06,12-01,12-02`.

Exact workers more often recognized relocation, symbol ownership, byte layout, alignment, or section ordering as a separate mismatch class and changed tools accordingly.

> "The exact worker's key process advantage was recognizing when the mismatch class had changed and switching tools" (`09-04`)
>
> "The exact worker's main advantage was hypothesis completeness: before editing, it reconstructed the entire `.data` layout from target/current bytes, symbol sizes and binding, relocation offsets, string placement, and the compiler-generated jump table, then made one coordinated layout edit." (`11-04`)

**Counterexample:** The nominal exact worker in `03-01` left relocation-only mismatches unresolved. The `06-01` control diagnosed symbol ownership correctly, but the owning header was outside its write set. Deterministic data targets in epochs 11 and 12 also make this differentiator look stronger than it is.

### 4. Recover target-specific authored source before prolonged coercion

**Support: 11 reports.** `03-02,06-04,07-05,07-06,08-05,08-06,09-01,09-02,10-05,12-03,12-05`.

The stronger pattern was not generic history search. It was finding a target-specific accepted PR, exact commit, matched sibling, packed type, helper, or compiler-steering analog and turning that evidence into the next experiment.

> "The most important process difference was the exact worker's late pivot from local compiler-shaping experiments to authoritative source recovery." (`09-02`)
>
> "The exact worker searched the symbol ledger and past PRs at the outset, got the specific lead that local types and declaration order had matched this function before, and converted that into one high-leverage `JObjIndices` type-shape edit." (`03-02`)

**Counterexample:** The `09-02` control also recovered useful historical source, but it was not exact. History searches in `03-01` did not close the recorded relocation gap.

### 5. Use bounded matrices and ablation only after naming the causal values

**Support: 9 reports.** `06-02,08-02,08-03,09-06,10-05,12-03,12-04,12-05,12-06`.

Exact workers used custom variant matrices, instruction-window scoring, or one-at-a-time cue removal to test a defined allocator, scheduling, or layout hypothesis. Broad permuter volume alone did not separate outcomes.

> "The exact worker built targeted scripts to enumerate source shapes, inspected the emitted instruction sequence, and kept narrowing until only two loop-update instructions were reversed" (`08-02`)
>
> "One-at-a-time removals proved causality: removing those anchors yielded 99.89247%, 99.92831%, the original 99.96416%, and an isolated Z-register mismatch, respectively." (`12-05`)

**Counterexample:** The `11-03` control searched up to 10,000 candidates without changing the final coloring. The `09-05` control exhaustively searched two 120-permutation spaces, but both represented the wrong hypothesis family.

### 6. Decompose mismatch classes and freeze solved regions

**Support: 9 reports.** `06-02,06-04,08-03,09-03,09-04,10-03,10-05,12-01,12-06`.

Exact workers more often locked in one cluster or source mechanism, reclassified the residual, and repaired frame, register, scheduling, or relocation fallout separately.

> "The exact worker's main process advantage was decomposing the residual diff into independent register-allocation clusters and locking down each cluster before attacking the next" (`10-03`)
>
> "The exact worker's main advantage was decomposition: it reduced the last floating-point register mismatch to a bounded search over equivalent source shapes, selected the shape with the right instruction/register behavior, then diagnosed its remaining uniform four-byte stack displacement separately and fixed it with `PAD_STACK(8)`." (`12-06`)

**Counterexample:** The systematic `11-05` control classified its 76 operand mismatches well, but classification did not reveal a unique C cause. The `03-01` exact transcript froze instruction identity without completing relocation repair.

## Failure modes of near-misses

Counts overlap because one control can exhibit several stall modes. The denominator is 43 real stalls; `11-06` is excluded because its continuing transcript reaches 100%. Every report says the worker read the residual correctly. Genuine diff misreads: **0 of 44**. Nine diagnoses were only symptom or category level, not source-solvable: `03-02,03-06,07-06,08-02,08-06,10-02,10-05,11-04,11-05`.

1. **Post-diagnosis plateau churn, 36 of 43.** Repeated declaration, type, cast, scope, helper, or permuter variants after the same diff recurred. Diagnosable from own output: yes, all 36. Pairs: `03-02,03-03,03-04,03-05,06-01,06-02,07-01,07-02,07-03,07-04,07-05,07-06,08-02,08-03,08-04,08-05,08-06,09-01,09-02,09-03,09-04,09-06,10-01,10-02,10-03,10-05,10-06,11-01,11-02,11-03,11-04,12-01,12-02,12-03,12-04,12-06`.

2. **Unresolved register, lifetime, or coloring cycle, 27.** The worker named the wrong physical registers or saved-register set but found no source form that moved only the required lifetime or coalescing edge. Diagnosable: yes; the C cause was often not directly inferable. Pairs: `03-02,03-03,06-02,07-03,07-04,07-05,07-06,08-02,08-04,08-05,09-01,09-02,09-03,09-05,09-06,10-01,10-03,10-05,11-01,11-02,11-03,11-05,12-01,12-02,12-03,12-04,12-05`.

3. **Failed to change abstraction or search scale, 17.** Local probes plateaued, but the control did not pivot to a semantic helper, whole-region boundary, indexed access, matched analog, or authoritative source. Symptom diagnosable: yes; exact structure usually not. Pairs: `06-04,07-01,07-03,07-04,07-06,08-04,08-05,08-06,09-02,09-03,09-05,09-06,10-01,10-03,10-06,11-03,12-03`.

4. **Failed to freeze and decompose independent classes, 12.** Stack, register, scheduling, and relocation controls changed together, making gains hard to attribute. Diagnosable: yes, usually by category. Pairs: `06-02,08-02,08-03,08-06,09-06,10-02,10-05,11-02,11-04,12-01,12-02,12-06`.

5. **Relocation, symbol, or data-ownership stall, 10.** Instructions were exact or nearly exact, but symbol identity, section ownership/order, assertion strings, or metadata remained. Diagnosable: yes, all 10. Pairs: `03-05,06-01,06-02,06-04,07-02,07-05,08-06,09-06,10-05,12-06`. The direct fix was outside the write set in `06-01` and `07-05` had a mixed metadata plus register stall.

6. **Correct diagnosis with no demonstrated controllable lever, 6.** Anonymous aggregate stack homes, unavailable FPR coloring, late scheduling, or allocator preference survived systematic search. These are weak evidence for a prompt-process failure. Diagnosable as symptoms: yes; uniquely solvable from the diff: no. Pairs: `03-06,09-01,09-04,11-03,11-05,12-05`.

## System/harness findings

- **Scope-bound count: 2 of 43 real stalls.** `06-01` had a proven owning-header declaration and translation-unit constant-order owner outside scope. `08-01` proved a coordinated source/header change at 100% but treated `gmregclear.h` as outside the write set. These are clearly system-bound rather than process failures.
- **Mixed scope and process: 2 more.** `07-05` needed out-of-scope `config/GALE01/symbols.txt` metadata but also retained one in-scope register mismatch. `12-03` could not widen the canonical header, but four allocator instructions still admitted an in-scope structural search. `08-06` needed cross-file prototype and data ownership changes, but the report does not prove they were outside approved scope.
- **Compliance gates:** `03-01` found an exact `(char**)` form rejected by the aliasing quality gate; `07-02` rejected open-coded `__assert` while compliant placement remained searchable. Exact-side helpers were later gate-rejected in `09-04` and `10-06`.
- **Tooling gaps: 9 reports.** Stale or failed diff/compiler/disassembly paths: `03-03,03-05,03-06`; broken or stale permuter setup: `07-01,10-06,11-02,12-05`; missing FPR allocator visibility: `09-01`; host-architecture compile block: `11-05`. Only `03-05,03-06,07-01,09-01` directly limited the control search; `11-05` used an emulator workaround.
- **Scorer and audit-policy effects:** Relocation policy changed whether instruction-identical code read as 100% in `03-02,03-06,07-01,07-06,09-02`. The nominal exact transcript in `03-01` ends at 99.90741%, with its labeled 100% absent. The nominal control in `11-06` reaches 100%, contradicting the supplied 99.98239%. Explicit timeout artifacts: **0**.
- **Target-difficulty and history confounds: 25 reports.** `03-02,03-04,03-05,03-06,06-01,07-01,07-04,07-06,08-03,08-05,08-06,09-01,09-02,09-04,10-02,11-01,11-02,11-03,11-04,11-05,12-01,12-02,12-04,12-05,12-06`. Commonly, the exact side had a directly invertible data, literal, or layout target, a target-specific exact commit, or a purpose-built section repair, while the control faced coupled MWCC allocation or scheduling.

## Candidate prompt rules

Each count is report-level support from the Transferable technique sections. The first five are marked by support.

1. **TOP 5, 37 reports.** Map every register or stack-slot mismatch to its source value and live range before editing. Change one lifetime, interference, or coalescing edge at a time, then verify the exact instruction window. (`03-02,03-03,03-06;06-01,06-02,06-04;07-01..07-04,07-06;08-01,08-03..08-06;09-01..09-06;10-01,10-03,10-05,10-06;11-01..11-05;12-01..12-06`)
2. **TOP 5, 36 reports.** Preserve every measured gain as a checkpoint. Restore it immediately after a no-op or regression, and record failed shapes so later passes do not repeat them. (`03-01..03-06;06-02,06-04;07-01..07-06;08-02,08-03,08-05,08-06;09-01,09-02,09-05,09-06;10-02,10-03,10-06;11-01..11-06;12-01..12-03,12-05,12-06`)
3. **TOP 5, 22 reports.** After every meaningful edit, run a full diff and classify the remainder as instruction, register, stack, scheduling, relocation, or data-layout differences. Freeze regions that already match. (`03-05,03-06;06-01,06-02;07-01,07-04,07-06;08-03;09-01,09-02,09-04,09-06;10-02,10-03,10-06;11-01,11-03,11-05,11-06;12-01,12-02,12-06`)
4. **TOP 5, 22 reports.** Stop a declaration, cast, scope, or expression family when two or three variants reproduce the same diff. Get new allocator, disassembly, history, or object evidence, then pivot structurally. (`03-03,03-04;07-03..07-05;08-03,08-06;09-01..09-06;10-01,10-02,10-05,10-06;11-03,11-06;12-01,12-02,12-06`)
5. **TOP 5, 20 reports.** Use scripted matrices and the permuter only for a bounded, named mismatch. Start from the current best baseline, rank candidates by exact changed instructions, and replay the winner manually. (`03-05;06-02;07-03;08-02..08-04;09-01..09-03,09-06;10-01..10-03;11-01..11-04;12-02,12-03,12-06`)
6. **17 reports.** Recover or introduce a coherent helper, inline, or call-expression boundary when local edits plateau. Tune its parameters and locals, then inspect allocation, frame size, and neighbors. (`03-01,03-06;06-01,06-04;07-01,07-04;08-04..08-06;09-01,09-04..09-06;10-01,10-03,10-06;12-03`)
7. **17 reports.** Validate every exact result beyond its score. Check the exact instruction or byte window, relocation policy, neighboring functions or full TU, source gates, and suspicious matching-only cues by ablation. (`03-01..03-03;06-01;07-01,07-05,07-06;08-06;09-05;10-01,10-06;11-02;12-01..12-05`)
8. **16 reports.** Treat relocation and data identity as a separate mismatch class. Once code shape matches, inspect symbols, relocations, translation-unit ownership, and `.sdata2` order instead of continuing allocator edits. (`03-01,03-04..03-06;06-01,06-02;07-02,07-05,07-06;09-02..09-04,09-06;10-06;12-01,12-02`)
9. **15 reports.** Treat prologue, frame-size, and stack-slot differences as explicit constraints. Fix live ranges first; if residual stack references share one displacement, adjust only the relevant lifetime, inline boundary, or `PAD_STACK`. (`03-01..03-04;06-04;07-04;08-03,08-04;09-05,09-06;10-03,10-06;11-04;12-03,12-06`)
10. **13 reports.** Search the exact symbol in the ledger, history, accepted PRs, matched siblings, and compiler analogs before a long allocator search or after a plateau. Test the smallest supported shape first. (`03-02,03-06;06-04;07-06;08-02,08-05,08-06;09-01,09-02,09-04;10-05;12-03,12-05`)
11. **9 reports.** For data-section targets, dump target and candidate bytes, symbols, sizes, bindings, relocations, alignment, and generated tables before editing. Reconstruct the complete layout and verify each symbol plus the whole section. (`07-05;11-01..11-06;12-01,12-02`)
12. **6 reports.** Apply a proven owning-header, prototype, metadata, or configuration fix. If it is outside the write set, escalate immediately instead of spending the run on source-only substitutes. (`03-01,06-01,07-05,08-01,08-06,12-03`)
13. **4 reports.** For a proven register-only liveness problem, test a semantics-empty read, guarded empty use, self-assignment, or required dummy declaration at the exact lifetime boundary. After matching, remove each cue separately. (`10-05;12-03..12-05`)
