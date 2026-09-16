# Standards Alignment Audit

**29 worker-facing records can become 21 without losing a single lint binding, and four defects must be fixed before the next SMS run regardless of any merge.** Two of the four would reject every SMS attempt: the SMS map-validation rule errors on every changed `.cpp` in the diff-mode scan the worker gate uses, and the global pragma rule rejects the marked `#pragma dont_inline` that the SMS marker record and upstream `AGENTS.md` both permit.

Inputs: 32 records (19 global at `knowledge/global/...`, 13 SMS at `games/sms/...`), 81 examples, every family `rules.py`, the engine, upstream `AGENTS.md` and `AGENT_MATCHING_TIPS.md`. Dump used by both readers: `evidence/standards-dump.md`. Two independent readers produced the overlap and contradiction findings; the binding cross-check was run mechanically.

Rendering facts that shape every recommendation: only `summary`, `do`, `do_not`, the first example, and `qa_rule_ids` reach a worker (`decomp-context.ts:176-235`). `preferred_repairs` never render. The enforceable binding between a rule and a record is `standard_id` in `rules.py`, not the record's `qa_rule_ids` array.

## 1. Defects to fix first

| # | Defect | Effect | Status |
| --- | --- | --- | --- |
| D1 | `sms_symbol_map_validation` raises "Materialize the patch and build its objects" whenever the scan runs in diff mode. The worker gate always passes `--diff-file`. | Every SMS attempt touching a `.cpp` is rejected once the gate composes SMS rules, which it now does. | Fixed: `surfaces: {worker: skip}`; `pr_gate` unchanged. Verified by probe. |
| D2 | Global `codegen_pragma` and `novel_pragma` error on `#pragma dont_inline` and `inline_depth` with no marker check. `sms-fabricated-marker` and upstream `AGENTS.md` both allow them as marked temporary debt. The `avoid-pragmas-register-asm` record's own PREFERRED example (`global_optimizer off` under `@todo`) fails its own rule. | Blocks the documented SMS path; the canonical example cannot pass the gate. | Fixed: marker within two lines downgrades to warning; `force_active` always an error. Verified by probe. |
| D3 | `evidence-bound-tactics-and-edits` lists 11 rule ids but no rule cites it. Its rules bind to five other records, three of them to `verification-and-regression-ledger`, which is `workflow_only` and never injected. | Findings cite a record the worker cannot see, or a record whose own `qa_rules` block omits the rule. | Fixed: staging record deleted, 11 examples re-pointed, three rules rebound to `matching-tactics-need-evidence`, `natural-loops` bindings cleared. |
| D4 | `banned_pattern:*` and `resubmission_tombstone` are bound in two `hard_lint` records. No `banned.jsonl` or `tombstones.jsonl` exists anywhere in the repository. Zero rules load. | Two records claim enforcement that does not exist. | Fixed: ids dropped; `literals-and-data-ownership` now `hard_lint`. |

Three examples contradict their own family rule and were corrected with D1 to D4: `typed-m2c-field-bridge` (PREFERRED uses `M2C_FIELD`, which `m2c_field_use` rejects), `matching-helper-replaces-dummy-local` (PREFERRED is an unmarked single-use wrapper, an error under `sms_fabricated_marker`), and `inert-unused-static-data` (PREFERRED leaves `sZero` unreferenced).

## 2. Contradictions between records

| Records | What conflicts | Severity | Resolution |
| --- | --- | --- | --- |
| `matching-tactics-need-evidence` vs `sms-temporary-tactics`, `sms-stack-independent-matching`, upstream tips | Global names `PAD_STACK(N)` as the accepted padding form and retains it with evidence. SMS forbids any padding trick and says leave nonmatching with a TODO. SMS has no `PAD_STACK` macro. | Confuses | Scope the `PAD_STACK` repair and example to Melee. SMS record states it overrides the global evidence exception. |
| `header-inlines` vs `sms-fabricated-marker` | Global says "expanded bodies are rejected". SMS says a hand-expanded body with `// fabricated` is a warning. The only hard lint for this, `copied_jobj_inline`, applies to `src/melee/**/*.c` alone. | Confuses | State in `header-inlines` that the hard lint is Melee C only and game marker records govern elsewhere. Change the SMS `do_not` to "expand without the marker". |
| `literals-and-data-ownership`, `text-before-data-matching` vs `matching-tactics-need-evidence`, `no-inert-emission` | The `order_sdata2` helper with `(void)` literals is BAD in one example and PREFERRED in another. The engine ships a generator for it and `discarded_expression` exempts it. | Confuses | One sentence in `literals-and-data-ownership` naming the tolerated `@todo` helper. Delete the `text-before-data` example. |
| `no-inert-emission` vs `sms-pch-string-convention` | Global rejects uncalled static functions. SMS accepts `static void dummy(Vec*)` with a `// dummy: emits` comment. | Cosmetic | Add the SMS exception sentence to the global record. |
| `conservative-naming` vs `sms-name-review` | Global example renames `lbl_804D6B10` to `g_debug_menu_cursor` on evidence. SMS says evidence alone is not naming approval and `sms_name_change_requires_review` errors on any rename. | Confuses; blocks only for m2c-style locals that `m2c_residue_names` demands renaming | Add "a game record may require review for every rename; SMS: sms-name-review wins" to the global record. |
| 13 of 16 injected global records vs `sms-names-types-helpers` | Global records carry Melee tokens as mandatory phrasing: `header-inlines` (HSD_JObj, GET_JOBJ), `assert-report-macros` (HSD_ASSERT, "no exception"), `typed-fields-over-pointer-math` (GroundVars, ItemVars), `matching-tactics-need-evidence` (PAD_STACK), `truthful-headers-and-includes` (`configure.py --require-protos`). SMS forbids injecting those conventions. | Confuses | Either tag Melee-specific bullets and examples with a `games` filter, or rewrite the summaries game-neutral and move the Melee examples to a Melee game slice. This is the root cause of the SMS "do not inject HSD" sentence. |
| `text-before-data-matching`, `data-sections-and-tu-splits` vs REPORT Part 1.1 and 4.3 | Both say defer data work until text is complete. The harness ran 66 section targets as first-class work and accepted function regressions under them. No record or rule carries the owner-evidence requirement from 4.3. | Policy gap | Amend `data-sections-and-tu-splits` per 4.3 and mark `text-before-data-matching` superseded for section-target work. |
| `verification-and-regression-ledger` vs `assert-report-macros` | Ledger example keeps a raw `__assert` with a TODO. Assert record says "no exception". Same `qa_rule_id`. | Confuses reviewers | Delete the ledger example. |
| REPORT Part 4.4 item 5 vs `sms-temporary-tactics` | The audit said "leave stack-shaping sites in place but mark them". The record says annotation is not permission. `sms_dummy_stack_padding` errors regardless of marker. | Confuses | Rewrite 4.4 item 5: comment out or remove padding; mark only pragmas and helpers. |

## 3. Contradictions with upstream SMS rules

| Upstream | Harness | Resolution |
| --- | --- | --- |
| `AGENTS.md`: `#pragma dont_inline` is "a temporary fakematch", mark it fabricated. | `avoid-pragmas-register-asm` rejects outright; `codegen_pragma` errors. | D2. |
| `AGENTS.md`: a TU-local fabricated helper is "a good first step". | `matching-tactics-need-evidence` forbids manual expansion without objdiff evidence; no marker allowance in the global text. | Add "or carries the game's fabricated marker". |
| `AGENT_MATCHING_TIPS.md`: "new inlines need to be fabricated based on own's best judgement". | `sms-stack-independent-matching` forbids inventing helpers solely for frame size. | Reword to "unmarked helpers". |
| `AGENTS.md` prefers nonmatching plus TODO over any committed fakematch. | `sms-fabricated-marker` tolerates committed marked scaffolding as a warning. | Soft tension; note upstream preference in the record. |

The remaining upstream rules (commented-out padding arrays, marker calls removed before submit, names via review) are consistent with the harness records.

## 4. Enforcement mismatches

Every `qa_rule_id` resolves to a registered rule except the two dead `banned_pattern` bindings (D4). Eleven rules have a `rules.py` binding that disagrees with the record listing them (D3). Beyond that:

- Records claiming hard lint with no effective SMS rule: `header-inlines`, `assert-report-macros`, `typed-fields-over-pointer-math` (`stage_ground_var_owner` is `src/melee/gr/gr*.c` only), `truthful-headers-and-includes`, `data-sections-and-tu-splits`. Their bound rules are `.c`-only or Melee-path-only. Cosmetic, but the `qa_enforcement` field should say so.
- `no-inert-emission` text covers uncalled static functions and `force_active`; no rule of its own detects either. The micro-gate `unused-static-function` and the pragma rules do, under other records.
- `sms_local_class_needs_owner` is declared error but emits a warning in its main path (no header declares the class); error only when the map places the class in another unit. The record says "do not define a placeholder class" as required. Pick one.
- Warning-tier rules under a "rejected" record: `duplicated_inline_body`, `fixed_fn_pointer_call`, `storage_widening`, `cancelling_arithmetic`, `layout_cue_local` all bind to records whose text says the construct is rejected.
- One construct, two findings: `JGeometry::TVec3<f32>();` fires `sms_dummy_stack_padding` and `discarded_expression`; `#define X Y` around an include fires `define_alias` and `header_override_macro`; the PCH guard predefine fires `header_override_macro` and `sms_pch_string_convention`; every `dont_inline` fires `codegen_pragma` and `sms_fabricated_marker`. Suppress the second in each pair.

## 5. Overlap and the proposed consolidated set

Full pairwise table with quotes: `evidence/standards-overlap.md`. Summary of merges:

| Survivor | Scope | Folds in | Rule ids and examples that move |
| --- | --- | --- | --- |
| `literals-and-data-ownership` | Global | `no-string-literal-symbol-regression` (string subset, same rule ids), `data-sections-and-tu-splits` (already merged; every sentence duplicated), `text-before-data-matching` (self-declared workflow) | `string_literal_to_symbol`, `packed_string_blob`; two data-section examples; three examples dropped |
| `no-inert-emission` | Global | the `sdata2-order-helper` example from `matching-tactics-need-evidence`; the "dummy statics" bullet from `literals-and-data-ownership` | |
| `matching-tactics-need-evidence` | Global | tactic half of `evidence-bound-tactics-and-edits` | `dangling_ref_return`, `guard_removal`, `arg_order_change`, plus the four already bound; seven fidelity examples |
| `typed-fields-over-pointer-math`, `header-inlines`, `infer-authored-source-style` | Global | their `evidence-bound` rules and examples | `scalar_member_index`, `unassigned_member_deref`; `duplicated_inline_body`; `single_use_wrapper` |
| `conservative-naming` | Global | `no-define-alias-global-renames` | `define_alias`; both examples |
| `no-symbol-forgery` | Global | the include-shim construct from `truthful-headers-and-includes` | retag `headers-include-proto-shim` to `header_override_macro` |
| `sms-authored-evidence` | SMS | `sms-names-types-helpers` (keep the placeholder-class sentence and the "no HSD conventions" sentence until the Melee leak is fixed); drop its restated global sentences | `sms_local_class_needs_owner`; one example |
| `sms-map-symbols` | SMS | `sms-map-research`; move the gate description to `qa_enforcement` | keep "same-named method in another game" bullet |
| `sms-temporary-tactics` | SMS | `sms-stack-independent-matching`; pragma bullet moves to `sms-fabricated-marker` | keep "investigate every inline including (void)0 stubs" bullet |
| `sms-fabricated-marker` | SMS | STT pragma marking; drop the `force_active` restatement | |
| `sms-name-review`, `sms-pch-string-convention` | SMS | add the "overrides conservative-naming" and "exception to no-inert-emission" sentences | drop the macro-alias bullet from name-review |
| unchanged | | `assert-report-macros`, `avoid-pragmas-register-asm`, `natural-loops`, `canonical-control-flow-and-macros`, `truthful-headers-and-includes`, `sms-cpp-format`, `sms-game-code-only` | |
| out of the block | | `verification-and-regression-ledger` (already), `sms-regression-evidence` (build commands, the exact duplicate the ledger record warns against), `sms-initial-sweep-scope` (run intent) | set `workflow_only`, `worker_facing: false` |

| Count | Before | After |
| --- | ---: | ---: |
| Global records injected | 16 | 13 |
| SMS records injected | 13 | 8 |
| Examples attached to injected records | 81 | about 68 |

Estimated block size reduction: 25 to 35 percent of the 58 KB, unmeasured. The five provenance sentences ("Accepted 2026-09-16 with implemented lint rules...") were moved out of the summaries into a `provenance` field.

Restatements to prune inside surviving records: `sms-map-research` and `sms-initial-sweep-scope` both restate `sms-game-code-only`; `sms-names-types-helpers` and `sms-authored-evidence` both restate `sms-name-review`; `sms-fabricated-marker` restates the `force_active` ban a third time; `sms-map-symbols` describes the CI gate in its `do` list.

Near-duplicate examples across records kept apart: `header-inline-local-quicksort`, `authored-style-local-inline-count`, and `matching-helper-replaces-dummy-local` share one PREFERRED shape; `canonical-abs-macro` and `authored-style-local-helper` share one BAD shape; `fidelity-storage-widening-mtx44` and `sms-temporary-tactics-2` differ only in whether the widened local is used. `sms-cpp-format-1` is not a bad/preferred pair at all.

## 6. What is not a worker requirement

| Record | Why | Belongs in |
| --- | --- | --- |
| `verification-and-regression-ledger` | runner build and objdiff policy | operator docs; stop using it as a `rules.py` binding target |
| `text-before-data-matching` | "leave prioritization to workflow and runner policy" | delete; prioritization into runner policy |
| `data-sections-and-tu-splits` | every sentence exists in `literals-and-data-ownership` | delete after moving two examples |
| `sms-regression-evidence` | `ninja baseline` and `ninja changes_all` commands | `workflow_only`; validation config |
| `sms-initial-sweep-scope` | describes the experiment's scope, no lint | `workflow_only`; objective docs |
| `infer-authored-source-style` do item 4 ("sweep the touched files") | process step | worker prompt |
| `sms-map-symbols` "Build changed TUs before QA..." | pipeline description | `qa_enforcement` field |

## 7. Recommended order of work

1. D1 to D4 and the three example fixes are done. Tests: 168 Python, server typecheck clean.
2. Apply the merges in section 5 as record edits; no rule code changes are required beyond the D3 rebinding.
3. Resolve the Melee-token leak in global records by tagging or by a Melee game slice. Until then keep the SMS "no HSD conventions" sentence.
4. Amend `data-sections-and-tu-splits` with the owner-evidence requirement from REPORT 4.3, then delete `text-before-data-matching`.
5. Suppress the four double-firing pairs in section 4.

## 8. Applied

The consolidation in section 5 was applied on 2026-09-16 with these results.

| Measure | Before | After |
| --- | ---: | ---: |
| Global records (files) | 19 | 14 (13 accepted, 1 workflow_only) |
| SMS records (files) | 13 | 10 (8 accepted, 2 workflow_only) |
| Melee game slice | none | 1 record, `melee-conventions`, holding every HSD, JObj, GroundVars, ItemVars, FighterVars, PAD_STACK, and GALE01 sentence and 9 examples moved out of the global set |
| Records injected into an SMS worker | 29 | 21 (13 global, 8 SMS) |
| Examples attached to injected records | 81 | 62 |
| SMS worker standards block | 58,652 bytes | 49,852 bytes |
| Melee-only tokens in the SMS block | 4 records | 0 |
| Rule bindings lost | | 0 |
| Replay over 1,046 integrations, rejected | 99 | 98 (pragma double-fire collapsed; same 51 exact matches) |

Records deleted: `no-string-literal-symbol-regression`, `data-sections-and-tu-splits`, `text-before-data-matching`, `no-define-alias-global-renames`, `evidence-bound-tactics-and-edits`, `sms-names-types-helpers`, `sms-map-research`, `sms-stack-independent-matching`. Demoted to workflow_only: `sms-regression-evidence`, `sms-initial-sweep-scope`. `literals-and-data-ownership` now carries the section-target owner-evidence and no-function-regression requirement from REPORT Part 4.3.

Double-firing removed: `codegen_pragma` and `novel_pragma` yield to `sms_fabricated_marker` on SMS pragma lines; `header_override_macro` yields to `sms_pch_string_convention` on PCH guard predefines; `discarded_expression` yields to `sms_dummy_stack_padding` on discarded constructor statements; `define_alias` yields to `header_override_macro` on the include-shim shape.

Two record lists intentionally include an id the slice manifest binds elsewhere, because `rules.py` re-points individual findings: `matching-tactics-need-evidence` lists `extern_in_c` (function externs), `canonical-control-flow-and-macros` lists `define_alias` (control-flow aliases). Both are documented in the rules.

Open after this pass:

- `context.ts:594` sends the full standards block to any game that has game-scoped records regardless of budget. Melee now has one, so Melee compact and minimal workers also receive the full 36.9 KB block.
- `knowledge/global/.../data/standards_reference.md` and the review-lint micro-gate `ruleId` strings in `review-lint.ts` still use the names of merged records; cosmetic.
- The generated sandbox image context under `games/sms/runtime/images/` still carries the pre-move lint engine and must be regenerated.
