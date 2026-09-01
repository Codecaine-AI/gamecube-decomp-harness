## Verdict

The exact worker kept treating register-allocation mismatches as evidence about source shape, then continued through regressions until it found a structural form that changed the allocator: array indexing replaced long-lived pointer locals. The near-miss worker correctly diagnosed its residue as long-lived register allocation, but stopped after local type, scope, and initialization variants plus one permuter run. The difference was persistence with instruction-led structural hypotheses, not merely more guessing.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, but increasingly instruction-specific. It explicitly worked on operand flow, with lines such as "**Mapping register arguments between target and candidate**" and "**Identifying induction pointer as order variable**." It also used allocator snapshots and candidate disassembly rather than relying only on score changes.
- The decisive move: after declaration reorders, temporary aliases, loop rewrites, and permuter runs failed, it replaced the `order` and encounter pointer locals with indexed access through `arg1[...]` and `arg2[temp_idx]`, widened `target_char` to `s32`, and reached 99.90741% with only `cmpw r3,r23` versus `cmpw r23,r3`. Simply reversing the C equality did not alter codegen. Restoring two direct `Stage_8022519C(...)` calls in the comparison changed evaluation/register flow and produced 100%.
- Tool rhythm: roughly edit -> full `checkdiff` -> inspect operands -> revert or refine, with 41 edits and 45 diff checks. Pivotal support included direct object disassembly, three allocator snapshots, two permuter runs, git history/blame, past-PR and knowledge searches. Those searches supplied context, but the exact result came from manual source-shape experiments tied to the diff.

## Near-miss worker: why it stalled

- It got stuck on a broad register permutation: `arg1` in r30 instead of r24, the `option_roots` induction pointer in r23 instead of r30, the animation tree in r26 instead of r30, plus `valid` materialized in r3 rather than r0. It tried `valid` type and condition forms, block versus function scope, split versus combined initialization, argument signedness/casts, a related-function analogy, and a 500-iteration permuter run.
- It never tried the exact worker's strongest late tactic: remove or shorten the long-lived pointer/alias locals by expressing the accesses as array indexing, then use the resulting one-instruction diff to drive evaluation order. It also did not take allocator snapshots after each promising structural rewrite to map which C value moved to which physical register.
- The stall was diagnosable from its own diff. Its final note says, "The residual target diff is dominated by long-lived register allocation," and lists the exact wrong register assignments. It did not misread that evidence; it stopped before turning the diagnosis into a broader source-lifetime experiment.
- Loop quality: mixed. The experiments were relevant and regularly checked, but several variants revisited the same `valid`/`visible` initialization neighborhood while the final evidence pointed to wider live-range structure. It used 17 edits and 18 diff checks.

## Transferable technique

- When a diff is dominated by wrong registers, map each physical register to its C value, then test source forms that change live ranges, especially indexed array access versus a persistent pointer local.
- After reaching a one-instruction operand mismatch, change expression evaluation shape, including direct calls versus saved temporaries; do not assume swapping commutative operands changes MWCC codegen.
- Keep a best-known source checkpoint and revert regressions quickly, but continue beyond declaration-order and type tweaks when allocator evidence still identifies a structural live-range problem.
- Use allocator snapshots and direct disassembly to verify which hypothesis moved each value; use the permuter as a bounded search, not as the stopping criterion.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: yes
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, checkpoint-restore, scheduling-reasoning
