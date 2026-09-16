# Standards Overlap Reader (full table)

Abbreviations: LDO literals-and-data-ownership, NSL no-string-literal-symbol-regression, TBD text-before-data-matching, DS data-sections-and-tu-splits, NIE no-inert-emission, MT matching-tactics-need-evidence, EB evidence-bound-tactics-and-edits, STT sms-temporary-tactics, SSIM sms-stack-independent-matching, SFM sms-fabricated-marker, THI truthful-headers-and-includes, NSF no-symbol-forgery, NDA no-define-alias-global-renames, SPC sms-pch-string-convention, CN conservative-naming, SNR sms-name-review, SNTH sms-names-types-helpers, SAE sms-authored-evidence, HI header-inlines, IAS infer-authored-source-style, VRL verification-and-regression-ledger, SRE sms-regression-evidence, SMS sms-map-symbols, SMR sms-map-research, CCF canonical-control-flow-and-macros, NL natural-loops.

## Tactics and evidence

| A | B | Overlap (quoted) | Recommendation |
|---|---|---|---|
| MT | EB | MT: "widened local lifetimes, dummy locals, volatile locals, manual inline expansion ... not allowed ... unless recorded build/objdiff/regression evidence". EB: "widened storage, expanded inline bodies, single-use wrappers, cancelling arithmetic, layout-cue locals ... repaired or explained with objdiff evidence". EB summary: "Staging record for the Part 4.3 amendments". | MERGE INTO MT. rules.py already binds EB's 11 rules to five older records, none to EB. Make MT wording language-neutral (PAD_STACK, "local extern/inlining steering" are C/Melee). |
| MT | STT | MT do_not: "Replace PAD_STACK(N) with UNUSED u8 sp_pad[N] or similar dummy local buffers". STT: "Do not commit dummy arrays, unreferenced locals ... with or without volatile". | KEEP BOTH. MT permits padding with evidence; STT forbids outright and requires nonmatching plus TODO (upstream AGENTS.md, no PAD_STACK in SMS). STT must state it overrides MT for SMS. |
| STT | SSIM | STT: "leave the function nonmatching with a TODO comment". SSIM: "report it explicitly and stop rather than manufacturing a full match". SSIM do_not "Invent visibility, members, helpers or storage solely to manipulate the frame size" = STT "fabricated storage or other baseless tricks". Examples: `char stackPadding[16]; // force 100%` vs `char trash[4];`. | MERGE INTO STT (has lint and the real bosseel example). Carry SSIM's unique bullet: "Investigate every relevant inline, including (void)0 assert stubs, before attributing a discrepancy to padding". SSIM's "do not relabel a partial match as 100%" goes with SRE/VRL. |
| STT | SFM | STT do: "Keep narrow temporary pragmas explicitly annotated"; STT preferred_repairs: `// TODO: temporary matching pragma ... #pragma dont_inline on`. SFM: pragmas "carry // fabricated, // fake, // fakematch or // TODO". | PRUNE the pragma bullet and repair from STT. SFM owns SMS pragma marking; avoid-pragmas owns the global ban. |
| STT | NIE | STT do_not: "Write JGeometry::TVec3<f32>(); or another discarded constructor expression as a statement". NIE: "Discarded literals ... pure calls whose result is dropped". | KEEP BOTH; different lints (frame vs section bytes). One construct, two findings. |
| EB | SFM | EB do: "mark fabricated wrappers with // fabricated"; EB example PREFERRED "keep the wrapper only with // fabricated". SFM: "fabricated static inline helpers ... carry // fabricated"; SFM repair is also a `dotProduct` wrapper. | KEEP BOTH. Global text should say "mark per the game's fabricated-marker convention". Near-duplicate dotProduct example. |
| EB | STT | fidelity-storage-widening-mtx44 BAD `Mtx44 transform;` vs sms-temporary-tactics-2 BAD `Mtx44 transform; JGeometry::TVec3<f32> position;`. | KEEP BOTH (widened-and-used vs never-referenced). Flag near-dup. |
| SFM | avoid-pragmas / NIE | SFM: "#pragma force_active is never accepted". NIE do_not: "keep force_active pragmas". avoid-pragmas: `novel_pragma`. | PRUNE the force_active line from SFM (third statement). |
| MT | NIE | MT example sdata2-order-helper PREFERRED: `/// @todo .sdata2 order hack static void order_sdata2(void) { (void) -1.0f; ...}`. NIE do: "Keep an unavoidable .sdata2 ordering helper isolated in its own order_* function with a @todo marker". | Move sdata2-order-helper example to NIE (owns `discarded_expression`). |
| MT/NIE | TBD | TBD example BAD: `static void sdata2_order(void) { (void) 0.0F; (void) 1.0F; }` PREFERRED: inline literals. | Contradiction: TBD's BAD is MT's PREFERRED. Delete the TBD example (also mis-tagged `extern_in_c`). |

## Literals and data

| A | B | Overlap | Recommendation |
|---|---|---|---|
| LDO | NSL | LDO: "Promoting a string, float, or constant into named storage because generated output exposed an address is not allowed". NSL: "String literals ... are required to stay inline". Both list `extern_in_c, banned_pattern:*, resubmission_tombstone`. | MERGE INTO LDO. Keep NSL's "Packed blobs and pointer offsets used as a matching dodge are rejected" and the maintainer-approved data-ownership exception. Rebind `string_literal_to_symbol`, `packed_string_blob`. |
| LDO | NIE | LDO do_not: "Add fake data anchors, dummy statics, or data-order globals". NIE: "unreferenced file-scope static data, and uncalled static functions ... rejected". | KEEP BOTH (literal promoted to symbol vs inert emission). PRUNE LDO's "dummy statics, or data-order globals" bullet. |
| LDO | DS | DS "Fix section ownership or symbol metadata instead of compensating with fake source storage" = LDO "Fix symbol/split metadata instead of adding fake C storage". DS "Move data across translation units without split evidence" = LDO "Move literals across translation units without split evidence". | PRUNE DS (already merged). Move data-section-owned-sdata2-move and data-section-symbol-metadata to LDO; drop data-section-split-boundary. |
| LDO/NSL | TBD | TBD do_not: "Add or move static data, literal externs, local assert overrides, fake helpers, fake anchors, or split churn solely to quiet a data diff". TBD repair: "Leave broad text-vs-data prioritization to workflow and runner validation policy." | PRUNE TBD (self-declared workflow). |

## Headers, symbols, names

| A | B | Overlap | Recommendation |
|---|---|---|---|
| THI | NSF | THI do_not: "Macro-rename identifiers around an include to dodge prototype conflicts"; example `#define __THPReadFrameHeader __THPReadFrameHeader_proto`. NSF: "rename macros wrapped around an include"; example `#define inv_sqrt inv_sqrt(f32); ... #undef inv_sqrt`. | KEEP BOTH; move the include-shim construct to NSF only. Retag headers-include-proto-shim to `header_override_macro`. `define_alias` and `header_override_macro` both fire on the same line. |
| NDA | CN | NDA do_not: "Rename address-style globals to semantic names because an external mirror ... guessed the role". CN do_not: "Rename address-style symbols before source meaning is supported". | MERGE NDA INTO CN. CN gains `define_alias` and both examples. |
| NSF | SNTH | SNTH do_not: "Define a placeholder class at file scope in a .cpp; the owning header (per the map unit) declares it". NSF: "A file-scope placeholder class X in a .cpp that the include tree already defines ... is rejected". | NSF covers the map-owner half. SNTH's residual (no header exists yet) folds into SAE; rebind `sms_local_class_needs_owner`. Three examples of one construct. |
| NSF | SPC | SPC do_not: "Predefine SYSTEM_DUMMY_STRINGS_HPP ...". NSF do_not: "Predefine <NAME>_HPP ... around an include". | KEEP BOTH. SPC must be worded as an SMS exception to NIE. Guard predefine fires both rules. |
| CN | SNR | CN: "A semantic name is required to carry supporting evidence". SNR: "evidence alone is not naming approval". CN example renames `lbl_804D6B10` to `g_debug_menu_cursor`; forbidden under SNR. | KEEP BOTH; SNR must say it overrides CN for SMS. PRUNE SNR "Hide a rename behind a macro alias" (global `define_alias`). |
| SNR | SNTH, SAE | Both restate "renames require explicit maintainer review under sms-name-review". | PRUNE both restatements. |
| SNTH | SAE | SNTH: "Use mario.MAP and debug strings for names, signatures, class structure and original helper boundaries". SAE do: "Use matched siblings, original symbols, headers, debug strings and the map". Examples SAE-1 vs SNTH-1 near-identical. | MERGE SNTH INTO SAE. Keep "no HSD/JObj conventions" and the placeholder-class sentence. Drop SNTH-1. |
| SAE | IAS | SAE: "Prefer plausible authored C++ supported by local source, assembly, mario.MAP and objdiff"; do_not "Accept a fakematch solely because its score improves". IAS: "a shape that only moves a score is rejected". | KEEP SAE for SMS content (evidence sources, MSL intrinsic bypass). PRUNE the two restated global sentences. No example exists for `sms_intrinsic_bypass`. |
| SMR | SMS | SMR: "Record which maps, revisions and symbols support a name"; restates sms-game-code-only. SMS: "Extract names, signatures, presence, ordering, linked binding and known UNUSED sizes from the map". | MERGE SMR INTO SMS. Keep "Assume a same-named method in another game has the same ABI" do_not. Drop sms-map-research-1. |
| HI | IAS | HI: "Restore local inline helper boundaries when sibling functions share the same body shape"; IAS example desc: "Restore the authored helper boundary when nearby code shows the project used that boundary"; MT example is also a static inline helper. | KEEP BOTH. Three examples share one PREFERRED shape. HI's do bullets are all HSD/jobj. |
| HI | SFM | HI do_not: "Copy or paste jobj.h inline helper bodies". SFM do_not: "Expand a header inline body by hand". | KEEP BOTH; SFM adds the marker-as-warning path. |
| CCF | IAS | canonical-abs-macro BAD vs authored-style-local-helper BAD are the same abs pattern. | KEEP BOTH; flag near-dup. |
| NL | CCF | NL lists `m2c_goto_label, m2c_residue_names`; rules.py binds them to CCF and CN. | KEEP BOTH; set NL qa_rule_ids to []. |

## Verification and process

| A | B | Overlap | Recommendation |
|---|---|---|---|
| VRL | SRE | VRL do: "Run narrow touched-object builds ... Run objdiff or checkdiff ... Inspect adjacent functions". SRE do: "Run ninja baseline ... ninja changes_all ... Validate affected neighbors". VRL repair: "Do not duplicate manual ledger requirements inside code-quality standards." | SRE is the duplicate VRL warns against. Set SRE workflow_only, worker_facing false. |
| VRL | SSIM | SSIM "do not relabel a partial match as 100%" = VRL example verification-contradictory-claim. | Move to VRL/operator docs. |
| VRL | assert-report-macros | VRL example keeps raw `__assert` with a TODO; ARM: "no exception". Both tagged `unrolled_assert`. | Delete or retag the VRL example. |
| SMS | VRL | SMS do: "Build changed TUs before QA. The SMS gate requires fresh objects and invokes tools/validate-symbol-order.py". | Pipeline description; move to `qa_enforcement`. |
| sms-game-code-only | SMR, sms-initial-sweep-scope | Both restate "no JSystem/SDK edits". | KEEP sms-game-code-only (has lint). PRUNE the restatements. |

## Example moves per merge

| Merge | Rule ids move | Examples move | Dropped or flagged |
|---|---|---|---|
| NSL to LDO | string_literal_to_symbol, packed_string_blob | string-asset-label-inline, string-packed-blob-offset | drop string-archive-section-inline; flag literal-extern-float-anchor vs literal-address-floats-inline |
| DS to LDO | none | data-section-owned-sdata2-move, data-section-symbol-metadata | drop data-section-split-boundary |
| TBD pruned | none | text-before-data-code-match-blocked-by-data to operator docs | drop text-before-data-sdata2-helper, text-before-data-table-regression |
| EB to MT | fixed_fn_pointer_call, storage_widening, cancelling_arithmetic, layout_cue_local, dangling_ref_return, guard_removal, arg_order_change | seven fidelity examples | flag storage-widening-mtx44 vs sms-temporary-tactics-2 |
| EB to typed-fields | scalar_member_index, unassigned_member_deref | two fidelity examples | unassigned-member-deref duplicates symbol-forgery-local-class-shadow |
| EB to HI | duplicated_inline_body | fidelity-duplicated-inline-body | |
| EB to IAS | single_use_wrapper | fidelity-single-use-wrapper | near-dup of SFM dotProduct |
| MT to NIE | none | sdata2-order-helper | |
| NDA to CN | define_alias | both NDA examples | |
| THI to NSF | none | headers-include-proto-shim (retag) | near-dup of symbol-forgery-header-override-macro; keep one |
| SNTH to SAE | sms_local_class_needs_owner | sms-names-types-helpers-2 | drop sms-names-types-helpers-1; sms-authored-evidence-1 duplicates typed-item-vars-owning-base |
| SMR to SMS | none | none | drop sms-map-research-1 |
| SSIM to STT | none | none | drop sms-stack-independent-matching-1 |
| SRE, initial-sweep to workflow_only | none | their examples leave the block | |
| VRL | none | two examples to operator docs | delete or retag verification-assert-conversion-todo |

Example count: 81 before, 11 dropped, 2 moved to operator docs, about 68 remain.
