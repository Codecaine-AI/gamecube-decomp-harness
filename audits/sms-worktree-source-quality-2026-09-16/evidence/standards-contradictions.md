# Standards Contradiction Reader (full table)

## Record vs record

| # | Records | Side A | Side B | Lint reality | Severity | Resolution |
|---|---|---|---|---|---|---|
| 1a | sms-fabricated-marker, sms-temporary-tactics vs avoid-pragmas-register-asm | "#pragma dont_inline / inline_depth ... carry // fabricated ... a warning that stays visible debt"; STT repair `// TODO: temporary matching pragma ... #pragma dont_inline on` | "Pragmas ... are banned in normal decomp source; source that adds them is rejected" | `codegen_pragma` error, no marker check, applies to .cpp; `inline_depth` hits `novel_pragma`. `sms_fabricated_marker` downgrades the same line. Both fire. | Blocks | Marker-aware downgrade in codegen_pragma/novel_pragma; add the exception sentence to avoid-pragmas. |
| 1b | matching-tactics-need-evidence vs sms-temporary-tactics, sms-stack-independent-matching, TIPS | "Use PAD_STACK(N) for intentional stack padding ... retain it only with recorded objdiff/regression evidence" | "Do not commit dummy arrays, unreferenced locals ... leave the function nonmatching with a TODO"; TIPS: temporary char array "should be removed or commented out" | PAD_STACK is a Melee macro; SMS has none. | Confuses | Tag the PAD_STACK repair and example Melee-only. |
| 1c | header-inlines vs sms-fabricated-marker, evidence-bound | "expanded bodies are rejected" | "hand-expanded inline bodies carry // fabricated ... a warning" | `copied_jobj_inline` is `src/melee/**/*.c` only; `duplicated_inline_body` is a warning; `sms_fabricated_marker` error unless marked. | Confuses | State the hard lint is Melee C only; change SFM do_not to "without the marker". |
| 1d | literals-and-data-ownership, text-before-data vs matching-tactics, no-inert-emission | LDO do_not "Create static literals or globals to force data order"; TBD BAD `static void sdata2_order(void) { (void) 0.0F; ...}` | MT PREFERRED `/// @todo .sdata2 order hack static void order_sdata2(void) {...}`; NIE "The only tolerated form is an isolated, @todo-marked order_sdata2-style helper" | `discarded_expression` exempts `order_*` with TODO; engine ships `sdata2_order_helper.py`. | Confuses | One sentence in LDO naming the tolerated helper; retire the TBD example. |
| 1d' | no-inert-emission vs sms-pch-string-convention | "uncalled static functions ... rejected" | "static void dummy(Vec*) ... accepted only with a // dummy: emits comment" | No lint conflict (`unused_static_data` skips functions; `sms_dummy_vec_helper` warning). | Cosmetic | Add the SMS exception to NIE. |
| 1e | conservative-naming vs sms-name-review, sms-authored-evidence | "Use a semantic name only when ... evidence supports the role"; example renames `lbl_804D6B10`; do_not "Leave temp_rXX-style names when a clear local role is known" | "Preserve existing names ... evidence alone is not naming approval" | `m2c_residue_names` error demands renaming temp_r30; `sms_name_change_requires_review` errors on any rename. | Blocks for m2c-style locals (rare in SMS); confuses otherwise | Add "SMS: sms-name-review wins" to CN. |
| 1f | 13 of 16 injected global records vs sms-names-types-helpers | Global records: GroundVars, HSD_ASSERT "no exception", HSD_JObjSet*, GET_JOBJ, `configure.py --require-protos`, `config/GALE01/symbols.txt` | "Inject HSD/JObj, FighterVars, GroundVars or ItemVars conventions into SMS" is forbidden | Every accepted global record with first example is injected into SMS prompts. Counts: header-inlines HSD_ x9 jobj x17; assert-report HSD_ASSERT x14; typed-fields GroundVars x5 ItemVars x4 M2C_FIELD x7; matching-tactics PAD_STACK x5. | Confuses | `games` tag with filter, or game-neutral rewrite plus Melee slice. |
| 1g | text-before-data, data-sections vs REPORT 1.1/4.3 | "Defer broad data-section matching until the text section is complete" | 66 section targets ran first-class; 4.3 wants owner-evidence and no function regressions | No owner-evidence field or regression guard exists in any record or rule. | Policy gap | Amend data-sections; mark text-before-data superseded for section work. |
| 1h | verification-and-regression-ledger vs assert-report-macros | Example keeps raw `__assert` with `@todo` | "no exception" | Both tagged `unrolled_assert`. | Confuses reviewers | Add the byte-mismatch exception or delete the example. |
| 1i | REPORT 4.4 item 5 vs sms-temporary-tactics | "Leave stack-shaping sites in place but mark them" | "Treat annotation as permission to ship a fakematch" is forbidden | `sms_dummy_stack_padding` errors regardless of marker. | Confuses | Rewrite 4.4 item 5. |

## Enforcement mismatches

- `banned_pattern:*`, `resubmission_tombstone`: bound in literals-and-data-ownership and no-string-literal-symbol-regression; data dir absent everywhere; zero rules load.
- Rules whose rules.py `standard_id` disagrees with the record listing them: dangling_ref_return, guard_removal, arg_order_change (ledger, workflow_only); scalar_member_index, unassigned_member_deref (typed-fields); fixed_fn_pointer_call, storage_widening, cancelling_arithmetic, layout_cue_local (matching-tactics); duplicated_inline_body (header-inlines); single_use_wrapper (infer-authored-source-style). All eleven listed only by evidence-bound-tactics-and-edits, which no rule cites.
- Records claiming lint with no effective SMS rule: header-inlines (`copied_jobj_inline` Melee C only), literals-and-data-ownership and no-string-literal (`extern_in_c` C-only, banned absent), matching-tactics (behaviors it names are detected by source_fidelity rules it does not list), truthful-headers and data-sections (`extern_in_c`, `bare_local_prototype` C-only), typed-fields (`stage_ground_var_owner` gr*.c only), assert-report-macros (HSD idioms only), no-inert-emission (no rule for uncalled functions or force_active of its own).
- `sms_symbol_map_validation`: `check_maps` raises in diff mode; worker gate always uses diff mode; error per changed .cpp. Blocks.
- Severity disagreements: sms_intrinsic_bypass (warning) vs required record; sms_dummy_vec_helper (warning) vs "accepted only with"; sms_local_class_needs_owner declared error, emits warning in main path; duplicated_inline_body warning vs "rejected"; fixed_fn_pointer_call, storage_widening warning and cancelling_arithmetic, layout_cue_local info vs "Tactic presence without evidence is rejected"; dangling_ref_return error citing a workflow_only record.

## Upstream SMS rules

| Upstream | Harness | Conflict | Resolution |
|---|---|---|---|
| `#pragma dont_inline` "is a temporary fakematch"; mark fabricated | avoid-pragmas rejects; codegen_pragma errors | Blocks | 1a |
| TU-local fabricated helper "is a good first step" | matching-tactics forbids manual expansion without objdiff evidence | Confuses | add marker allowance |
| `volatile char trash[0x10]` prohibited to commit, temporary use encouraged; commented out after | sms-temporary-tactics allows commenting out; lints strip comments | Consistent | none |
| `extern void marker__()` removed after mapping | sms-temporary-tactics "Remove ... marker code before submitting" | Consistent | none |
| "Suggest meaningful names for unk* members" via proposal | sms-name-review consistent; conservative-naming allows direct evidenced rename | Confuses | 1e |
| prefer nonmatching plus TODO over any fakematch | sms-fabricated-marker tolerates committed marked scaffolding | Cosmetic | note upstream preference |
| TIPS: "new inlines need to be fabricated based on own's best judgement" | sms-stack-independent-matching forbids inventing helpers solely for frame size | Confuses | reword to "unmarked helpers" |

## Internal inconsistencies

| Record | Problem | Severity | Resolution |
|---|---|---|---|
| avoid-pragmas-register-asm | PREFERRED example `#pragma global_optimizer off` under `@todo` fails its own `codegen_pragma` rule | Blocks | marker exemption (1a) |
| typed-fields-over-pointer-math | PREFERRED `x = M2C_FIELD(gp, s32*, 0xC8);` fails `m2c_field_use` | Blocks / confuses | real field in PREFERRED |
| matching-tactics-need-evidence | PREFERRED single-use static inline is `single_use_wrapper` warning and `sms_fabricated_marker` error unmarked; retention path for PAD_STACK that SMS forbids | Confuses | add marker; scope PAD_STACK to Melee |
| infer-authored-source-style | PREFERRED single-call-site static inline errors under sms_fabricated_marker without marker | Confuses on SMS | tag Melee-only or add marker |
| no-inert-emission | PREFERRED leaves `sZero` unreferenced; `STATIC_DATA_RE` misses constructor-style initializers | Cosmetic + detector gap | use sZero; extend regex |
| sms-fabricated-marker | do_not forbids hand expansion that the summary tolerates when marked | Cosmetic | "without the marker" |
| sms-temporary-tactics | preferred_repairs shows a dont_inline pragma the composed gate rejects | Blocks | 1a |
| sms-names-types-helpers | record says required; rule warns in the no-header path | Confuses | align |
| literals-and-data-ownership | qa_enforcement hard_lint_plus_warning; all bound rules are error; two never load | Cosmetic | hard_lint |
| evidence-bound-tactics-and-edits | "Staging record ... until those records are amended"; amendments not applied; no rule cites it | Confuses | dissolve |
