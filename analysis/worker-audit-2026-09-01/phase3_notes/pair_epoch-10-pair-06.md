## Verdict

The exact worker eventually stopped treating the last mismatches as local expression noise and tested a translation-unit emission hypothesis: the helper's `inline` status controlled `.sdata2` constant order. The near-miss worker correctly localized its remainder to four `sqrtf` spill pairs, but stayed inside local declaration, padding, expression, and scheduling experiments. That difference in hypothesis level mattered more than raw iteration count, although the exact worker also spent many iterations on regressions before finding it.

## Exact worker: how the gap was closed

- Diff-reading style: mixed, but grounded in specific registers and relocations. It explicitly tracked "opposite f30/f31 allocation across the two angle/displacement blocks" and later recognized "instructions match but relocation/data references still differ." Source variants were tested against those concrete observations rather than score alone.
- The decisive move: after reusing `arg1` as the first loop counter and moving `i` earlier fixed the register-allocation portion, five mismatches remained at `.sdata2` references such as `lfd f31, @1020@sda21` and `lfs f3, @1022@sda21`. The worker inspected object sections, relocation IDs, history, and helper emission. Changing `grKongo_calc_angle` from `static inline` to ordinary `static` changed constant emission order and produced `PASS (100.00000%)`. An earlier artificial `.sdata2` ordering helper also reached 100%, but the worker rejected it after checking the unused-static-function gate.
- Tool rhythm: roughly edit -> `checkdiff_run` -> inspect full asm/object or allocator state -> revert/refine, with dozens of checks and several repeated no-op checks. Pivotal tools were `past_prs_search`, git history, `objdump`/`readelf`, `mwcc_alloc_snapshot`/compare, and neighbor/lint validation. The permuter was attempted once but could not parse the function, so it did not drive the result.

## Near-miss worker: why it stalled

- It got stuck on eight argument mismatches: four inlined `sqrtf` `stfs`/`lfs` pairs used candidate stack slots `0x24, 0x20, 0x1C, 0x18` instead of target `0x2C, 0x28, 0x24, 0x20`. It tried explicit scratch arrays, volatile pads, `PAD_STACK`, the historical `operand_pad`, declaration placement, expression nesting, initialization reordering, direct disassembly, and two bounded permuter runs. It never tested changing how `sqrtf` was supplied or inlined, despite reading its `extern inline` definition, which is the closest analogue to the exact worker's decisive helper-emission experiment.
- The stall was diagnosable from its own diff. Its final summary accurately said, "the four inlined sqrtf volatile store/load pairs use candidate stack offsets ... instead of target offsets." It did not ignore the evidence, but it narrowed the search to local stack-shape tricks even after those tricks repeatedly changed the whole frame or scheduling without moving the four slots correctly.
- Loop quality: mixed. The retained load-order fix was a clean instruction-led experiment, and the final stack diagnosis was precise. The later array/padding/declaration trials became shotgun, with large regressions to roughly 98.2% and repeated broad edits before restoration.

## Transferable technique

- When all opcodes match and only relocation IDs differ, inspect `.sdata2` ordering and test whether an inline helper's emission status owns the constants before rewriting arithmetic.
- When register-only loop diffs remain, inspect variable live ranges and historical source, then test parameter reuse and declaration order one change at a time.
- When repeated spill pairs differ only by stack offset, identify the inline expansion that creates the spills and test the inline boundary or header source, not only dummy locals and padding.
- After any 100% result, run lint and neighbor checks; if the winning form violates a hard gate, preserve the diagnosed mechanism and seek a gate-clean source shape.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: yes
- techniques: asm-diff-instruction-level, register-allocation-reasoning, past-pr-lookup, stack-frame-reasoning, scheduling-reasoning, inline-hypothesis, permuter
