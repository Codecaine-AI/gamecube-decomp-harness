## Verdict

The exact worker closed its gap because it escalated from the normal instruction diff to relocation-aware objdiff JSON and identified a wrong constant value, turning a codegen-looking mismatch into a direct semantic fix. The near-miss worker was at least as persistent and generally systematic, but its six differences came from compiler allocation of anonymous by-value `GXColor` temporaries. It diagnosed that correctly and tested many source-shape hypotheses without finding the hidden lifetime shape. Thus process explains part of the outcome, but the exact target also offered a much more directly actionable final mismatch.

## Exact worker: how the gap was closed

- Diff-reading style: instruction and relocation specific, with a small amount of hypothesis-driven editing. It started from named `lfd`/`lfs` relocation mismatches and later inspected the raw objdiff record at the mismatching address. Its clearest summary was: "The instruction sequence was already identical, but runner-owned relocation-value comparison showed the literal referenced the wrong .sdata2 value."
- The decisive move: after ordinary `checkdiff` reported PASS while the official objdiff score remained 99.965515%, it rebuilt the object with `functionRelocDiffs=data_value`, dumped JSON, walked the mismatch at address 7724, and compared left/right relocation records. That exposed the final `fn_8018FDC4` argument as `80.0f` where the target data value was `0.01f`. Replacing that literal produced 100%. An earlier ledger result saying the function had previously been 100% and had fallen after header/context churn also focused attention on `.sdata2` identity; extending `sdata2_order` made the ordinary checker pass before the stricter data-value check found the remaining literal error.
- Tool rhythm: two short edit-and-validate cycles rather than broad permutation. First: `checkdiff` plus ledger/graph lookup, edit `sdata2_order`, then `checkdiff` to 100% in that mode. Second: rebuild, raw objdiff JSON inspection plus small Python queries, one literal edit, rebuild/objdiff to 100%, then neighbor checks. No permuter or past-PR search was used.

## Near-miss worker: why it stalled

- It stayed stuck on six operands around `HSD_SetMaterialColor`: target temporary slots `0x118/0x11C/0x120`, current slots `0x20/0x24/0x28`. It tried moving padding declarations, lexical scopes, explicit `GXColor` locals, replacing padding with locals, pad-size compensation, an optimized-away aggregate reservation copied from `grMuteCity`, narrow and whole-body inline helpers, sibling-source comparisons, and a 500-iteration permuter. Every regression was reverted.
- The stall was diagnosable in category, but not directly solvable from the diff. The worker accurately wrote: "The compiler allocates HSD_SetMaterialColor aggregate argument temporaries in reusable low-frame slots rather than the target's high-frame slots." It did not ignore the evidence. What it never obtained was the exact whole-frame lifetime/allocation map or a known prior exact source shape that explained why those three anonymous copies occupied the high slots. Its objdump attempt failed, and it did not replace that failed inspection with the exact worker's raw objdiff-JSON style of targeted structural inspection. That omission may have limited the search, though raw JSON alone would not reveal the missing C lifetime.
- Loop quality: systematic. Each probe targeted declaration order, lifetime, aggregate reservation, or inline boundaries; it checked the score immediately and restored the baseline. The repeated explicit-local variants became somewhat exploratory, but they were tied to the observed offsets rather than random source churn.

## Transferable technique

- When ordinary `checkdiff` passes but the official score is below 100%, rebuild and inspect objdiff with relocation data-value comparison; identify the exact referenced constant before changing source shape.
- When every differing instruction shares stack operands, classify the values first as named locals or compiler-generated aggregate argument copies, then test declaration order, lexical lifetime, and inline boundaries one at a time, reverting each regression.
- Search the symbol ledger before experimenting; a recorded prior 100% state or sync regression can distinguish `.sdata2` identity churn from instruction-generation problems.
- If disassembly tooling fails, use objdiff JSON to inspect the exact left/right instruction and relocation records instead of continuing source experiments without a lower-level view.

## Flags

- exact_loop: systematic
- control_loop: systematic
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, stack-frame-reasoning, type-shape-experiments, inline-hypothesis, permuter, checkpoint-restore
