## Verdict

The exact worker turned its diff into a controllable source mechanism: it reconstructed `.sdata2` byte order, duplicate storage, alignment, symbols, and relocations, then changed only literal-pool ordering and explicit tail constants. The near-miss worker also diagnosed its diff correctly, including the remaining four-register allocation cycle, but could not map that cycle to one discriminating source rewrite; after the useful `arg3`/shape-pointer coalescing, its loop became broad allocator perturbation and permutation search. Process therefore explains part of the outcome, though the control target was intrinsically less direct than the exact worker's data-layout target.

## Exact worker: how the gap was closed

- Diff-reading style: systematic object-section forensics, not guess-and-check source variants. It compared target and candidate section bytes, symbol boundaries, and relocations. Its reasoning explicitly called out "**Investigating alignment-induced padding gaps**" and concluded, "**The retained named constants correspond to duplicate values and alignment boundaries observed directly in this translation unit's reference .sdata2 section.**"
- The decisive move: dumps showed the exact 200-byte value sequence plus duplicates and alignment boundaries that ordinary literal pooling removed. Typed `static inline` ordering helpers forced the pool sequence; explicitly aligned TU-local tail constants supplied the separately stored duplicates. When plain `static` helpers regressed consumer code, it restored inline helpers with an `int unused` parameter, removed redundant tails, and re-added only the declarations and calls proven by the section layout. That combination produced 100% `.sdata2` and kept the touched consumers exact.
- Tool rhythm: inspect/search -> edit -> `direct_compile_tu` -> `objdump`/`nm`/`readelf` -> candidate or full-unit objdiff, for roughly 7-9 substantive compile/score cycles. Full builds, lint, and a HEAD-versus-current JSON comparison guarded exact neighbors. Past-PR, ledger, code-graph, and knowledge searches supplied precedent and ownership context; no permuter was used.

## Near-miss worker: why it stalled

- It first faced 24 operand/register mismatches with matching control-flow shape. Reusing `arg3` as the 32-bit shape-animation pointer after its final mask use correctly coalesced arg3/shape in `r22` and archive/child traversal in `r26`, raising 99.21862% to 99.57085%. It then stalled on arg4, arg5, request-flags, and animation-flags register rotation.
- It tried declaration and update order, signedness and types, aliases, scopes, pointer reuse/splitting, unions and pointer/integer casts, helper extraction, loop/control-flow shapes, self-assignments, allocator snapshots, old source, and large permuter searches. What it never found was a small source-form enumeration tied separately to each remaining wrong source register; the experiments kept perturbing several live ranges at once.
- The stall was diagnosable and was not ignored. The worker wrote, "The remaining diff is a long-lived four-register allocation cycle involving arg4, arg5, request flags, and animation flags." Diagnosis was strong, but it did not yield a source mechanism as direct as literal-pool ordering.
- Loop quality: mixed. The edit -> full checkdiff -> objdump/allocator inspection -> revert discipline was systematic, but later 720/1800 declaration searches and multi-thousand-candidate permuter runs were shotgun once their hypotheses stopped separating variables.

## Transferable technique

- For a data-section target, dump target and candidate bytes plus symbol offsets and sizes before editing; reconstruct value order, duplicate storage, and alignment boundaries.
- After section bytes match, inspect relocations and score every consumer; equal bytes can still hide symbol-boundary or reference regressions.
- When a diff is register-only, map every wrong operand to its source live range, then test source forms that change one interference or coalescing edge at a time; stop broad permutations when they no longer test a distinct hypothesis.
- Keep a known-best checkpoint and restore every neutral or regressing candidate immediately; validate layout-sensitive edits with a full-TU diff against previously exact symbols.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, loop-restructure, checkpoint-restore, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning, section-byte-forensics, literal-pool-ordering
