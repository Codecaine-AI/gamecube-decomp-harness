## Verdict

The exact worker's main advantage was scope: when a cluster of register and offset diffs pointed to one shared global base, it investigated translation-unit BSS emission, declaration order, first use, and neighboring functions instead of treating every mismatch as a local expression problem. The near-miss worker correctly diagnosed its remaining relocation and register-allocation diffs and used stronger allocator tooling, but spent a long tail on source-shape variants after concluding that four diffs came from symbol metadata outside its write set. Process therefore explains part, not all, of the outcome.

## Exact worker: how the gap was closed

- **Diff-reading style:** Mixed, but hypothesis-driven. It grouped `addi r9, r31, 0x10`, `addi r29, r31, 0x10`, and related branch diffs into a base-layout problem rather than guessing only inside the target. Its own headings capture the shift: "**Investigating BSS symbol ordering and address aliasing**" and "**Confirming BSS emission order depends on first symbol use**." It still tried several speculative aggregate, pointer, getter, and initializer shapes.
- **The decisive move:** It placed `StaticModelDesc mnInfo_804A0958` immediately before `u8 mnInfo_804A0968[0x48]` and added an address-use anchor, `(void) &mnInfo_804A0958`, in the target. History and PR searches suggested adjacent BSS ordering; `nm`, `readelf`, and object disassembly then verified model at `.bss+0x0` and IDs at `.bss+0x10`. Declaration order alone stayed at 98.64901%, while the order plus first-use anchor produced 100%. A typed local model pointer in `fn_80252548` then repaired the neighbor regression without losing the target match.
- **Tool rhythm:** Before the first pass, roughly 10 edits and 13 target `checkdiff` runs, usually edit -> checkdiff -> inspect/revert. Pivotal tools were full instruction diffs, Git history and past-PR search, ledger/graph searches, `nm`/`readelf`/`objdump`, direct TU compilation, and MWCC regflow. A 300-iteration permuter run found no improvement. Same-unit summaries exposed and guided repair of the neighbor regression.

## Near-miss worker: why it stalled

- It ended with four conversion-constant relocation mismatches, retail `mn_804DBDF0` versus compiler-generated `@331`, plus a case-3 `r28` versus `r29` allocation mismatch. It tried named and volatile `f64` definitions, sdata2/order inspection, casts, pointer and integer locals, ternaries, scopes, unions, helper boundaries and parameter orders, allocator snapshots, and permuter runs. Inline digit-animation helpers did remove the earlier `mr` versus `addi` pair.
- It never completed the exact worker's broader symbol-emission playbook: after determining that the generated constant needed metadata/config treatment, it did not edit `config/GALE01/symbols.txt` because that path was outside its write set. It also did not find an in-scope first-use or neighboring-function lever that forced `@331` to coalesce with the named symbol.
- The stall was diagnosable and was not ignored. Its final account says, "remaining differences are four conversion-constant relocation names and case-3 r28 versus r29 allocation." The weakness was stopping discipline: after that diagnosis and failed allocator/permuter evidence, it continued many semantically similar source mutations instead of cleanly checkpointing the helper gain and isolating the metadata blocker.
- **Loop quality:** Mixed. Diagnosis and tool selection were systematic; the long series of casts, aliases, helper shapes, and signature permutations became shotgun-like.

## Transferable technique

- When many diffs share one global base and fixed offsets, inspect emitted symbol addresses, declaration order, and first-use order before rewriting the function body.
- Test declaration order and address-use anchors separately, then combine them only when object symbols and `checkdiff` support the causal hypothesis.
- When a helper or local-pointer change fixes the target, run a same-unit diff summary immediately and repair neighbor regressions while preserving the target checkpoint.
- When the diff names a generated constant instead of the expected symbol, separate source-shape experiments from metadata/config work; stop repeating source variants once object inspection and a bounded permuter run confirm the metadata blocker.

## Flags

- exact_loop: mixed
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, bss-emission-order-reasoning, permuter, past-pr-lookup, type-shape-experiments, checkpoint-restore, inline-hypothesis
