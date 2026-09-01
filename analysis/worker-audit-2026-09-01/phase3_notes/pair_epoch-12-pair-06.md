## Verdict

The exact worker's main advantage was decomposition: it reduced the last floating-point register mismatch to a bounded search over equivalent source shapes, selected the shape with the right instruction/register behavior, then diagnosed its remaining uniform four-byte stack displacement separately and fixed it with `PAD_STACK(8)`. The near-miss worker did good stack-layout archaeology and found real improvements, but it kept mixing array sizes, padding, declaration order, pointer tricks, structs, and helper/inlining changes. It never achieved the same clean sequence of “first match code generation, then repair the resulting frame.” Target differences mattered, so process explains the outcome only partially.

## Exact worker: how the gap was closed

- Diff-reading style: mixed at first, then instruction-level and hypothesis-driven. It repeatedly identified the lone `fmuls` operand allocation and compared target/candidate disassembly, explicitly framing the task as "Analyzing FPR coalescing and coloring conflicts." Later it moved to "Generating expression variants for disassembly" rather than continuing one-off edits.
- The decisive move: an automated batch of bound-calculation variants found a form that declared `l` before `u`, multiplied both in place, and assigned `lower`/`upper` afterward. That produced the desired floating-point instruction/register shape but scored 99.96491% because stack references were uniformly four bytes off. Changing the existing `PAD_STACK(4)` to `PAD_STACK(8)` then made `checkdiff_run` report `PASS (100.00000%)`.
- Observation chain: the original 99.98051% state differed at `fmuls`; allocator captures and direct assembly inspection tied it to FPR coloring; broad manual variants mostly regressed; a scripted variant sweep found the useful expression order; the full diff then exposed only consistent stack offsets; padding repaired those offsets.
- Tool rhythm: roughly 25-plus edit/build/checkdiff experiments, with frequent restoration after regressions. Pivotal tools were target/candidate `objdump`, `mwcc_alloc_snapshot`, a local scripted variant compiler/disassembler, and final `checkdiff`. The permuter was run twice but did not supply the winning edit. Past-PR, graph, ledger, and knowledge searches provided context, not the solution.

## Near-miss worker: why it stalled

- It first fixed the broad frame problem by changing `scores[6]` to `scores[4]`, making the case `0xDB` scratch array six entries, and removing `PAD_STACK(8)`. This aligned the prologue, saved registers, ranking/score slots, and cases through `0xFD`, raising the runner-equivalent score to 99.989914%.
- It remained stuck on case `0xFE`/`0xFF` scratch-array offsets plus two relocation aliases. It tried padding values, top-level and case-local declaration permutations, exhaustive scratch-array sizes, pointer-biased storage, nested scopes, struct-wrapped arrays, and helper extraction/inlining changes.
- The stall was diagnosable from its own diff. Its final summary states: "The remaining code mismatches are confined to the case 0xFE/0xFF scratch-array offsets." Yet it did not freeze the corrected global frame and run a bounded compile/disassembly search over semantically equivalent `0xFE`/`0xFF` calculation and assignment shapes, scoring each candidate at the instruction level. That is the exact worker's strongest transferable move.
- Loop quality: mixed. The array-size search and declaration permutation scripts were systematic, but pointer-underflow indexing, helper extraction, struct wrapping, and repeated padding/layout changes were broad probes that disturbed already-correct code generation.

## Transferable technique

- When one instruction differs only in source register, compare target and candidate disassembly, then batch-test equivalent expression shapes that change live ranges: declaration order, temporary order, compound assignment, and copy timing.
- After a source-shape change fixes register allocation, rerun a full diff and classify every residual mismatch before editing again. If all stack references move by one constant amount, adjust only the explicit stack padding.
- Preserve the best checkpoint after each structural gain. Once the prologue and early cases align, restrict experiments to the remaining block instead of changing global frame inputs again.
- Use exhaustive scripts for a bounded hypothesis, such as declaration permutations or local array dimensions, and rank candidates by the exact mismatching instructions rather than only whole-function score.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, stack-frame-reasoning, scheduling-reasoning
