# Phase 2 worker-audit rollup

Source: 21 `phase2_notes/batch_*.json` files, 1,627 workers (exact 107; near_miss 519; progressed 503; no_progress 498). Percentages use workers as denominators and count a normalized technique at most once per worker.

## Technique prevalence by cohort

| Normalized technique | Exact | Near miss | Progressed | No progress | Exact − near miss (pp) |
|---|---:|---:|---:|---:|---:|
| permuter | 34.6% | 65.9% | 65.6% | 61.8% | -31.3 |
| declaration/order experiments | 20.6% | 45.9% | 53.1% | 50.2% | -25.3 |
| register-allocation reasoning | 39.3% | 60.5% | 65.6% | 59.4% | -21.2 |
| data/relocation/layout | 36.4% | 16.6% | 7.4% | 10.4% | +19.9 |
| asm/object diff | 59.8% | 73.4% | 70.8% | 69.5% | -13.6 |
| history/analog lookup | 17.8% | 31.2% | 24.1% | 36.7% | -13.5 |
| float/literal shaping | 16.8% | 4.0% | 4.2% | 2.4% | +12.8 |
| checkpoint/regression | 22.4% | 34.7% | 28.2% | 40.8% | -12.3 |
| lifetime/scope experiments | 36.4% | 47.0% | 51.1% | 38.2% | -10.6 |
| review/gate repair | 14.0% | 4.6% | 5.2% | 2.2% | +9.4 |
| type/shape experiments | 37.4% | 45.1% | 45.3% | 41.2% | -7.7 |
| loop/control-flow restructure | 32.7% | 25.8% | 34.2% | 28.7% | +6.9 |
| stack layout/padding | 22.4% | 28.1% | 41.7% | 26.1% | -5.7 |
| inline/helper shaping | 40.2% | 45.1% | 48.5% | 36.9% | -4.9 |
| compiler/tool diagnostics | 0.9% | 5.6% | 2.2% | 7.8% | -4.7 |
| pointer/access shaping | 12.1% | 14.8% | 18.9% | 14.7% | -2.7 |
| expression shaping | 15.9% | 17.7% | 25.8% | 9.6% | -1.8 |
| instruction-scheduling reasoning | 2.8% | 1.5% | 3.0% | 1.0% | +1.3 |
| lookup/metadata analysis | 4.7% | 5.6% | 2.8% | 4.2% | -0.9 |
| local/temporary reuse | 2.8% | 2.1% | 2.6% | 1.0% | +0.7 |

Mapping note: hyphens and underscores were normalized before matching. Obvious variants were merged into semantic families—for example `source-permuter` → permuter; `allocator-*`, `regflow-*`, and `register-allocation-*` → register-allocation reasoning; `asm-diff-*`, `objdiff-*`, and `checkdiff-*` → asm/object diff; `local-lifetime-*`, `scope-lifetime-*`, and `variable-lifetime-*` → lifetime/scope experiments; `stack-padding-*`, `pad-stack-*`, and `stack-layout-*` → stack layout/padding; and past/history/ledger/sibling/analog lookup slugs → history/analog lookup. The table shows the 20 most-mentioned normalized families, sorted by absolute exact-versus-near-miss gap.

## Loop quality by cohort

| Loop quality | Exact | Near miss | Progressed | No progress |
|---|---:|---:|---:|---:|
| systematic | 97.2% | 72.6% | 84.1% | 56.2% |
| mixed | 2.8% | 9.6% | 13.7% | 16.9% |
| shotgun | 0.0% | 0.0% | 0.2% | 0.0% |
| unknown | 0.0% | 17.7% | 2.0% | 26.9% |

## Stall reasons

Free text was assigned once to the requested families. Because only nine requested families exist, all nine are shown (rather than 12); rows are sorted by total count.

| Normalized stall family | Exact | Near miss | Progressed | No progress | Total |
|---|---:|---:|---:|---:|---:|
| regalloc | 0 | 299 | 382 | 255 | 936 |
| unknown | 106 | 93 | 16 | 126 | 341 |
| other | 0 | 33 | 39 | 65 | 137 |
| relocation/data | 1 | 51 | 18 | 22 | 92 |
| stack frame | 0 | 28 | 22 | 21 | 71 |
| instruction scheduling | 0 | 10 | 13 | 6 | 29 |
| control flow shape | 0 | 5 | 7 | 1 | 13 |
| float/literal | 0 | 0 | 5 | 1 | 6 |
| inlining | 0 | 0 | 1 | 1 | 2 |

## Success factors

Exact-worker success factors were assigned to one primary family. The top 10 exclude the residual `other` family (8 workers). Examples are verbatim and shortened only by selecting already-short entries.

| Family | Count | Three verbatim examples |
|---|---:|---|
| register allocation / lifetimes | 28 | “reused the existing temporary for the second sign comparison”; “distinct endpoint Y lifetimes fixed the f28/f29 swap”; “promoting an arithmetic temporary to function scope fixed the f22/f25 allocation” |
| inline/helper boundaries | 17 | “natural inline-helper boundaries recovered exact instruction generation”; “restored JObj-loading inline boundary”; “two natural inline helpers corrected final-loop register allocation” |
| literal values / numeric precision | 11 | “correct negative maximum-float sentinel”; “corrected both sentinel literals to -3.4028235e38f”; “removed float suffixes to prevent pre-promotion rounding” |
| initializer / asset completion | 9 | “completed lbl_803B7CE0 initializer”; “completed missing collision data initializers”; “completing the 160-byte initializer with exact floats and eight callback relocations” |
| stack frame / local layout | 8 | “Mtx-before-Vec3 declaration order restored stack-slot layout”; “PAD_STACK(12) restored the exact retail stack layout”; “inline ABI helper reserved the retail sqrtf operand area” |
| typed structures / overlays | 8 | “recovered packed JObjIndices union and typed byte-walker loops”; “typed 13-record overlay plus six-pointer inline helper recreated register pressure”; “typed packed-index unions and a conversion-constant ordering reference” |
| loop / traversal shape | 8 | “one-based digit position with natural power-of-ten loop”; “natural table indexing eliminated the redundant pointer copy”; “saved base pointer plus advancing iterator” |
| constant ordering / relocations | 4 | “restored sdata2 symbol identities and corrected 80.0f to 0.01f”; “literal-pool reordering plus value-based relocation scoring”; “target-ordered TU-owned duplicate constants and alignment” |
| declaration / linkage / data placement | 4 | “canonical BSS order retained by an address-use anchor”; “static const placement moved the initializer into rodata”; “represented the zero object with target size, global linkage, and 8-byte alignment” |
| control flow / expression shape | 2 | “inverse if-else floor-check branch shape”; “direct call-site arithmetic expressions”; “split vertical-spacing expression reused the scale temporary” |

## Notables

1. `4320ac65-f2fb-43d5-aec0-90dc9dc61ce7` (no_progress): “An initial exact-match claim came from comparing the target object to itself; a qemu-i386 rebuild corrected the baseline to 98.452965%.”
2. `8e3f0e33-f18f-4e11-853f-3690e0a37e31` (progressed): “One worker used qemu and manual objdiff after wibo failed; two other summary files contain provider or launch errors.”
3. `90db38d8-911b-462a-9077-d0281e7c2aac` (near_miss): “Workers bypassed a 32-bit wibo Exec format error with qemu-i386, and one run later lost its sandbox IP.”
4. `53a6bd5a-8cff-46dc-9049-314191b74222` (near_miss): “One claim lost all source and build tools before its final constant-count probe could be compiled or reverted.”
5. `51670fa7-2afb-4052-9d17-d1a1fc10e5b6` (no_progress): “A manual comparison found all 116 instructions aligned exactly, suggesting the injected 96.68104 baseline was stale.”
6. `10cd0fa3-b5dc-4746-b92b-cb42ab96d086` (no_progress): “The worker concluded the C body already matches and that metadata incorrectly labels its compiler-generated trailing return as an empty function.”
7. `7e2da56a-e0cf-4286-aefb-b6339ba565cc` (exact): “The batch marks this worker exact at 100%, but its sole summary reports 99.85782% with matching instructions and six residual .sdata2 relocations.”
8. `f660390c-e7be-4471-b33e-e284c2097d78` (exact): “The runner classified it exact even though the final gate-clean summary reported 99.93262% under stricter relocation comparison.”
9. `b4b761db-f1e4-4b0e-81ee-af8a745d65ee` (progressed): “Two summaries report different retained improvements from the same baseline.”
10. `55a57f86-cdf4-4a90-b753-1e217ab5e6ea` (no_progress): “Later summaries claim a strict 100% 180-byte match from interleaved-layout byte-offset traversal, verified through qemu-i386 because native wibo execution failed, despite this row remaining in the no_progress cohort at 96.44444%.”

## Batch-note synthesis

- Register allocation and coloring dominated stalls outside exact. Many workers had matched instruction or control-flow shape and were left with one register swap, a short operand cluster, or allocator coupling to stack slots and scheduling.
- Permuter searches of roughly 1,000–5,200 candidates often confirmed local maxima; semantic helper recovery, natural indexing, lifetime changes, or stack calibration were more likely to close the last gap.
- Workers routinely rejected higher-scoring candidates that changed semantics, used uninitialized values, introduced implausible micro-helpers, relied on prohibited constructs, or regressed an exact neighbor.
- Diagnostic 100% builds were often not retainable because they required header edits outside the write set, changed BSS/symbol ownership, failed QA gates, or regressed neighboring functions.
- Cohort labels and self-summaries frequently disagreed: some near_miss/no_progress records reported validated 100%, while some exact records retained relocation mismatches or lower strict scores.
- Instruction parity did not guarantee object-level exactness; relocation identity, `.sdata2` ordering, symbol ownership, BSS layout, and section classification repeatedly made strict and runner comparisons disagree.
- Infrastructure failures reduced coverage: incompatible 32-bit `wibo`, provider timeouts/rejections, database locks, and missing summaries were recurring; `qemu-i386` sometimes restored validation. Batch 20 had no summaries for any of its 27 workers.
- Exact fixes were usually surgical: corrected float literals, stack padding, typed unions/byte cursors, temporary reuse for liveness, recovered helper boundaries, or reconstructed data/constant order.
- No-progress did not mean shotgun work: notes describe systematic diagnosis and substantial structural recovery even when allocation, ownership rules, or validation failures prevented a retainable exact result.
