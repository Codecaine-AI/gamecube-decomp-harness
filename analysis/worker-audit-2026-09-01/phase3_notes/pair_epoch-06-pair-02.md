## Verdict

The exact worker's main advantage was closing the loop between individual asm mismatches, MWCC allocator evidence, and narrowly targeted source-shape searches. It treated the r29/r31 swap as a register-lifetime problem, inspected allocator snapshots, then automated alias and pointer variants until one explained the remaining instructions. The near-miss worker also read asm and found real mismatch classes, but repeatedly changed declarations, scopes, padding, helpers, and literals without maintaining one comparably tight hypothesis-to-experiment sequence. Target complexity contributed, especially the near-miss's translation-unit constant pooling, so process explains the outcome only partially.

## Exact worker: how the gap was closed

- Diff-reading style: instruction-level and register-specific, followed by focused source experiments. Its reasoning explicitly says, "Mapping virtual nodes to registers" and later "Planning structured alias mapping search." It tracked the target's arg0, global base, data pointer, and hovered-selection value across r31, r29, and r30 rather than relying only on score changes.
- The decisive move: after typed `MenuFlow*` and `u16*` aliases improved the mapping but left a load/allocation mismatch, it added a `u16 hovered_value` temporary and reused that value across the highlighted-color check. Combined with a local `HSD_GObj*` alias, this made arg0 stay in r31, the global/update pointer use r29, and data use r30. The next full diff changed from 99.65190% to `PASS (100.00000%)`.
- Tool rhythm: inspect full diff and source, inspect regflow and allocator snapshots, form an allocation hypothesis, edit/build/checkdiff, revert regressions, then batch-test source variants. There were dozens of manual checks plus focused scripts, including one 164-configuration alias search. Graph, ledger, knowledge, asm-window, and past-PR searches supplied context; allocator JSON and objdump were pivotal. A permuter was consulted only through prior ledger evidence, not used for the winning edit.

## Near-miss worker: why it stalled

- It got stuck on four coupled classes: two `GXColor` stack slots at 0x20/0x24 instead of 0x8/0xC, text-loop register allocation, five duplicated `.sdata2` constants being pooled elsewhere, and a late r0/r4 swap. It tried declaration reorderings, nested scopes, structs, `PAD_STACK`, loop rewrites, pointer lifetime changes, float literal forms, inline helpers, sdata2-order helpers, allocator snapshots, and two bounded permuter runs. It never built the exact worker's focused, scripted enumeration of typed aliases/value temporaries against a specific register-interference hypothesis.
- The stall was diagnosable from its own diff and disassembly. It correctly stated, "The target text loop initializes char_count in r30 before strlen and uses r4 as the index; current source keeps the index in r19 and initializes r30 after strlen." It did not ignore that evidence, but it failed to turn it into a constrained search over expressions and lifetimes. It eventually found one scheduling improvement by moving the independent `bar_x` update before the color copy, reaching 99.544%.
- Loop quality: mixed. The assembly diagnosis and final scheduling change were systematic, but much of the middle was broad guess-and-check across interacting stack, register, and constant-pooling variables. Many experiments regressed heavily and were reverted; 1206- and 1800-iteration permuter runs did not solve the remaining gaps.

## Transferable technique

- When the diff shows a persistent register swap, map each source value to target and current registers, inspect allocator interference, then test typed aliases and value temporaries that change lifetimes or coalescing.
- Automate a bounded matrix of source-shape variants after identifying the affected values. Record score, function size, and leading register assignments for every candidate, and restore the baseline between trials.
- When two independent statements differ only in scheduling and operand registers, swap their source order and immediately validate the exact instruction window.
- Separate mismatch classes before editing. Treat stack-slot layout, loop register allocation, and translation-unit constant pooling as distinct hypotheses, and retain only changes that remove the predicted diff lines.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, type-shape-experiments, scheduling-reasoning, stack-frame-reasoning, float-literal-tricks, permuter, past-pr-lookup
