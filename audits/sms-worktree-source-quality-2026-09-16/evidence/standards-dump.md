## global_standard:literals-and-data-ownership  [global/literals_data_and_externs] status=accepted severity=required rules=['extern_in_c', 'extern_own_tu_data', 'numeric_literal_to_symbol', 'address_named_static_data', 'banned_pattern:*', 'resubmission_tombstone']
**Literals stay inline; extern in a .c file is banned**

- summary: Promoting a string, float, or constant into named storage because generated output exposed an address is not allowed; source that keeps such an invented symbol is rejected. | An extern declaration in a .c file is banned outright: declare the symbol in its owning header or define the data in this translation unit. | The only permitted named-data case is recorded section-ownership evidence (.data, .rodata, .sdata, .sdata2 metadata, symbol metadata, or split boundaries); absent that evidence the literal stays inline.
- do: Keep constants, strings, and float literals inline; named data is required to carry recorded section-ownership or symbol metadata as evidence. | Verify .data, .rodata, .sdata, and .sdata2 ownership before naming any data; unverified naming is rejected. | Declare any needed symbol in its owning header or define the data in this TU; an extern in a .c file is never accepted.
- do_not: Create static literals or globals to force data order; such source is rejected. | Replace ordinary numeric literals such as 0.0F, 1.0F, or -F32_MAX with TU-local address-named symbols for relocation or data-order pressure. | Add fake data anchors, dummy statics, or data-order globals; these are hard failures, not style. | Move literals across translation units without split evidence.
- preferred_repairs: Keep literals inline; named data ownership is accepted only with recorded section ownership, symbol metadata, or surrounding-source evidence. | Fix symbol/split metadata instead of adding fake C storage to chase data order. | Replace address-named float statics such as un_804DDF74 or un_804DDCE4 with inline literals like 0.0f, 7.0f, -3000.0F, or 3000.0F; keep the symbol only when data ownership is proven.
- example literal-extern-float-anchor: BAD `extern const f32 lbl_804DA60C;  speed = lbl_804DA60C;  const f32 lbl_804DA60C = 1.0F;` → PREFERRED `speed = 1.0F; /* Keep named data only when symbol metadata and section ownership prove it. */`
- example literal-address-floats-inline: BAD `static const f32 un_804DDF74 = 0.0F; static const f32 un_804DDF70 = 7.0F;  angle = *(f32 const*) &un_804DDF74; limit = *` → PREFERRED `angle = 0.0f; limit = 7.0f; /* Keep ordinary float literals inline unless section ownership proves named data. */`
- example literal-real-owned-data: BAD `lbArchive_LoadSections(archive, (void**) &models,                        "Vi0502_scene_models", NULL); /* Real table/sec` → PREFERRED `static Vi0502Data vi0502_data = {     "Vi0502_scene_models",     "Vi0502_scene_textures", };  lbArchive_LoadSections(arc`

## global_standard:no-string-literal-symbol-regression  [global/literals_data_and_externs] status=accepted severity=required rules=['extern_in_c', 'string_literal_to_symbol', 'packed_string_blob', 'banned_pattern:*', 'resubmission_tombstone']
**Replacing string literals with data symbols is not allowed**

- summary: String literals used as asset names, resource labels, assert/report text, and table labels are required to stay inline for code-matching changes. | Replacing a literal with a generated or global data symbol is a data regression and is rejected; the only permitted exception is maintainer-approved data-ownership evidence that explicitly scopes the change as data work.
- do: Keep source string literals inline when they are ordinary asset names, table labels, assert/report text, or resource names. | A string-literal-to-symbol change is accepted only as scoped data-ownership work backed by recorded evidence. | Land the code match that leaves the literal in place whenever the alternative only relocates a data section.
- do_not: Replace a literal such as "MenMainBack_Top_joint" with a symbol such as mnNameNew_803EE38C to chase data parity. | Convert strings into named globals because generated output exposed an address or another data section looks closer. | Ship a string-symbol replacement that creates report noise; it is rejected unless the change is explicitly scoped as data ownership and recorded evidence explains the tradeoff.
- preferred_repairs: Keep asset names, table labels, assert text, and report text inline when they are ordinary source literals. | Recover real string tables only with ownership evidence. | Packed blobs and pointer offsets used as a matching dodge are rejected.
- example string-asset-label-inline: BAD `extern char mnNameNew_803EE38C[];  HSD_ArchiveGetPublicAddress(archive, mnNameNew_803EE38C);` → PREFERRED `HSD_ArchiveGetPublicAddress(archive, "MenMainBack_Top_joint"); /* Keep ordinary asset labels inline unless data ownershi`
- example string-archive-section-inline: BAD `lbArchive_LoadSections(arg0, (void**) &AutoNamesList,                        mnNameNew_803EE6D0, &NotAllowedNamesList,  ` → PREFERRED `lbArchive_LoadSections(arg0, (void**) &AutoNamesList,                        "mnNameAutoNameUs", &NotAllowedNamesList,  `
- example string-packed-blob-offset: BAD `static char lbl_803EFB60[0xA8] = "Can't get user_data.\n\0\0\0";  OSReport(lbl_803EFB60 + 0x28);` → PREFERRED `OSReport("Can't get user_data.\n"); /* Recover a real evidenced string table only when source ownership proves it. */`

## global_standard:text-before-data-matching  [global/literals_data_and_externs] status=merged severity=workflow_context rules=['extern_in_c', 'string_literal_to_symbol', 'numeric_literal_to_symbol', 'packed_string_blob']
**Match text before chasing data sections**

- summary: For matching changes, text-section function progress is the primary objective. | Data, literal, symbol, and split edits are high-risk secondary work: keep them only when required for the claimed code match, backed by section ownership or symbol metadata, or explicitly scoped as data cleanup.
- do: Prioritize verified text-section function closure or matched-code progress over data-section parity. | Keep data, literal, symbol, or split edits only when they are required for the code match, backed by section ownership or metadata, or explicitly scoped as data cleanup. | Narrow or revert data edits that create noisy report regressions or false-positive section movement when the code match can land without them. | Defer broad data-section matching until the translation unit's text section is complete unless a data owner issue blocks the code match.
- do_not: Chase data-section parity as routine matching work before the translation unit's text section is complete. | Add or move static data, literal externs, local assert overrides, fake helpers, fake anchors, or split churn solely to quiet a data diff. | Mix a focused code match with unrelated .sdata, .sdata2, .rodata, or symbol cleanup. | Retain data changes that create section-regression noise unless the change is explicitly about data and the evidence explains the tradeoff.
- preferred_repairs: Handle code-quality data/literal regressions through the literals/data/externs family. | Leave broad text-vs-data prioritization to workflow and runner validation policy.
- example text-before-data-code-match-blocked-by-data: BAD `/* PR note */ All functions in this TU are exact. /* Matching status is still claimed without mentioning unresolved .sda` → PREFERRED `/* PR note */ Text functions are exact. Data layout remains unresolved and is tracked separately. /* Do not convert data`
- example text-before-data-sdata2-helper: BAD `static void sdata2_order(void) {     (void) 0.0F;     (void) 1.0F; }` → PREFERRED `speed = 1.0F; angle = 0.0F; /* Use metadata fixes or explicit data scope for real ownership work. */`
- example text-before-data-table-regression: BAD `static u8 table_blob[] = {     0x10, 0x20, 0x30, 0x40, }; /* Large table reshaping is mixed into a focused code match. *` → PREFERRED `/* Land the verified text match first. */ /* Keep table reshaping in a data-scoped change with section evidence. */`

## global_standard:data-sections-and-tu-splits  [global/literals_data_and_externs] status=merged severity=required rules=['extern_in_c']
**Respect data sections and translation-unit split evidence**

- summary: Section placement, symbol size/scope, local labels, assert filenames, string clusters, object names, and float groups are part of matching. | Fix metadata instead of compensating with fake C storage.
- do: Treat .data, .rodata, .sdata, .sdata2, .sbss, and split ownership as match evidence. | Fix symbols.txt size, type, scope, or local labels when metadata is wrong. | Use assert filenames, object names, strings, and float groups as TU split evidence.
- do_not: Add dummy C storage to compensate for bad symbol metadata. | Move data across translation units without split evidence. | Treat section placement as cosmetic.
- preferred_repairs: Fix section ownership or symbol metadata instead of compensating with fake source storage. | Use split evidence under the literals/data/externs family.
- example data-section-split-boundary: BAD `/* Move copied Purin code into a new file only. */ #include "ftkirbyspecialpurin.h" /* configure.py, splits.txt, and sym` → PREFERRED `/* Add the new TU source and header. */ /* Update configure.py, splits.txt, and symbols.txt for text/data/sdata/sdata2 o`
- example data-section-symbol-metadata: BAD `static u8 gmopening_804D6A10; static u8 gmopening_804D6A11; /* C storage is added to compensate for symbol layout. */` → PREFERRED `/* config/GALE01/symbols.txt */ /* Correct the .sbss symbol scope and local labels at the owning addresses. */ /* Then k`
- example data-section-owned-sdata2-move: BAD `extern f32 lbl_804D1234;  value = lbl_804D1234; /* The float is left owned by the old object after the function moved. *` → PREFERRED `/* Move the source owner and the .sdata2 symbol metadata together. */ value = owner_table->scale; /* Update callers and `

## global_standard:header-inlines  [global/asserts_reports_and_header_inlines] status=accepted severity=required rules=['copied_jobj_inline', 'unrolled_assert']
**Existing inlines and helpers are required; expanded bodies are rejected**

- summary: Expanded header asserts, especially from jobj.h, must be mapped back to the existing inline/helper when line numbers and local evidence identify the source-level operation; keeping the expanded body is rejected. | Local helper boundaries must be restored when duplicated expanded bodies or sibling functions show an authored helper shape.
- do: Use assert file and line numbers to find the owning header inline. | Use the existing HSD_JObjSet*, HSD_JObjGet*, and local inline forms when they represent the operation. | Use GET_JOBJ only when local evidence supports that access shape. | Restore local inline helper boundaries when sibling functions share the same body shape and objdiff supports the helper call or inline.
- do_not: Keep expanded __assert("jobj.h", line, ...) when the header inline is identifiable. | Copy or paste jobj.h inline helper bodies into stage, item, or fighter TUs. | Duplicate a helper instead of calling the canonical HSD_JObj* helper or adding the missing helper at the owning API layer. | Treat GET_JOBJ as unconditional cleanup. | Redefine or manually expand header helpers to force a match without objdiff evidence. | Duplicate a local helper body into multiple wrappers when a shared inline helper represents the source shape.
- preferred_repairs: Use header file/line evidence to recover HSD_JObj* helpers or the owning inline. | Use GET_JOBJ only when local evidence supports that access shape. | Restore shared local helpers, such as quicksort-style wrapper bodies, instead of keeping duplicated expanded versions.
- example header-inline-jobj-helper: BAD `static inline void LocalSetMtxDirty(HSD_JObj* jobj) {     if (jobj == NULL) {         __assert("jobj.h", 0x2F4, "jobj");` → PREFERRED `HSD_JObjSetMtxDirty(jobj); /* Or use the shared WithMtxDirty variant when that is the evidenced helper. */`
- example header-inline-get-jobj-evidence: BAD `jobj = GET_JOBJ(gobj); HSD_JObjSetTranslateX(jobj, x);` → PREFERRED `jobj = HSD_GObjGetHSDObj(gobj); HSD_JObjSetTranslateX(jobj, x); /* Use GET_JOBJ only when local evidence supports that a`
- example header-inline-local-quicksort: BAD `void sort_ascending(TySortElem* base, s32 lo, s32 hi) {     /* Full quicksort body is pasted here. */ }  void sort_desce` → PREFERRED `static inline void quicksort(TySortElem* base, s32 lo, s32 hi) {     /* Shared evidenced helper body. */ }  void sort_as`

## global_standard:assert-report-macros  [global/asserts_reports_and_header_inlines] status=accepted severity=required rules=['unrolled_assert', 'fake_assert_macro', 'assert_idiom_downgrade']
**Project assert and report macros are required when they represent the source**

- summary: Raw assert/report expansions must become HSD_ASSERT, HSD_ASSERTMSG, HSD_ASSERTREPORT, OSReport, or OSPanic forms whenever the file, line, message, and side effects match local project idioms; a shipped raw __assert block that had a macro form is rejected. | There is no exception: an existing macro form must replace the raw expansion, and real report/panic side effects may not be dropped.
- do: Use HSD_ASSERT for plain assertions. | Use HSD_ASSERTMSG or HSD_ASSERTREPORT when message or report side effects are real. | Preserve real OSReport and OSPanic behavior while removing generated assert blocks.
- do_not: Leave direct __assert blocks when an existing macro is the source-level form. | Invent fake assert strings, report globals, or dummy storage to force a match. | Drop a real report or panic side effect.
- preferred_repairs: Restore HSD_ASSERT, HSD_ASSERTMSG, HSD_ASSERTREPORT, OSReport, or OSPanic forms when they represent the source. | Preserve real report/panic side effects while removing raw assert expansions.
- example assert-report-direct-asserts: BAD `if (obj == NULL) {     __assert(__FILE__, 0x88, "obj"); }` → PREFERRED `HSD_ASSERT(0x88, obj);`
- example assert-report-macro-osreport: BAD `if (archive == NULL) {     OSReport("archive is null\n");     __assert(__FILE__, 0x154, "archive"); }` → PREFERRED `HSD_ASSERTREPORT(0x154, archive, "archive is null\n"); /* Preserve the report side effect while using the project macro `
- example assert-fake-message-helper: BAD `static inline char* grKongo_AssertMsg(void) {     return &grKg_803E1A00[0]; }  if (gp->gv.kongo.u.taru.keep == NULL) {  ` → PREFERRED `HSD_ASSERT(1719, gp->gv.kongo.u.taru.keep); /* Do not invent helper functions or data symbols just to feed assert text. `

## global_standard:typed-fields-over-pointer-math  [global/typed_access_and_pointer_math] status=accepted severity=required rules=['stage_ground_var_owner', 'm2c_field_use', 'type_erasing_cast', 'pointer_offset_arithmetic']
**Typed fields, union arms, and accessors are required; M2C_FIELD and pointer math may not ship**

- summary: When a type can describe an access, real fields, correct FighterVars/GroundVars/ItemVars union arms, accessors, or temporary internal structs are required; M2C_FIELD and raw pointer arithmetic may not ship in accepted source. | The single permitted exception is a type_erasing_cast surfaced for llm_review, which must be justified in the attempt summary; a raw ((u8*) obj) + offset access without that review is rejected.
- do: Replace raw offsets with real fields when the type is known; a shipped byte offset over a known type is rejected. | Use the correct fighter, ground, and item union arms; borrowing unrelated fields is not allowed. | In stage TUs, use or add the GroundVars union arms owned by that map/stage family; borrowing another map's arm is rejected. | Recover the type or field so M2C_FIELD is removed before ship; a retained type_erasing_cast requires recorded llm_review justification.
- do_not: Ship ((u8*) obj) + offset when a field, union arm, helper, or temporary struct can express the access. | Add or retain M2C_FIELD when the real type can be recovered. | Use unrelated union arms such as gv.arwing in another stage TU because the offsets happen to line up. | Use unrelated union arms because generated output guessed them.
- preferred_repairs: Replace byte offsets with real fields, correct union arms, helpers, or temporary typed structs. | Use or add the owning GroundVars/FighterVars/ItemVars arm instead of borrowing unrelated layouts. | Keep a type_erasing_cast only when the llm_review exception is recorded and justified in the attempt summary.
- example typed-item-vars-owning-base: BAD `Item* ip = GET_ITEM(gobj); value = *(s32*) ((u8*) ip + 0xE38);` → PREFERRED `typedef struct itArwingLaser_ItemVars {     char x0_pad[0x64];     s32 xE38; } itArwingLaser_ItemVars;  value = ip->xDD4`
- example typed-stage-ground-vars-owner: BAD `/* grIceMt.c */ gp->gv.corneria.xC8 = 0;` → PREFERRED `/* grIceMt.c */ gp->gv.icemt.xC8 = 0; /* Add the owning icemt GroundVars field first when it is missing. */`
- example typed-m2c-field-bridge: BAD `x = *(s32*) ((u8*) gp + 0xC8); y = *(s32*) ((u8*) gp + 0xCC);` → PREFERRED `x = M2C_FIELD(gp, s32*, 0xC8); y = M2C_FIELD(gp, s32*, 0xCC); /* Better: recover the struct fields and replace the bridg`

## global_standard:matching-tactics-need-evidence  [global/codegen_tactics] status=accepted severity=required rules=['extern_in_c', 'volatile_local_tactic']
**A matching tactic without recorded evidence is rejected**

- summary: PAD_STACK, declaration order changes, widened local lifetimes, dummy locals, volatile locals, manual inline expansion, direct global access, and temporary padded structs are not allowed in reviewable source unless recorded build/objdiff/regression evidence justifies each one. | Tactic presence without that recorded evidence is rejected; the tactic's only permitted basis is the objdiff/regression benefit it demonstrably produces.
- do: Keep tactic use narrow and record the verifier evidence that justifies it; an unrecorded tactic is rejected. | Check adjacent functions when a tactic can perturb codegen, data order, or local stack shape. | Remove the tactic once the underlying type, control flow, or data ownership is understood.
- do_not: Use a tactic that shifts nearby functions or hides a real type. | Ship stack/register/local churn as permanent style without recorded objdiff benefit. | Keep broad tactics without recorded evidence and a cleanup reason. | Replace PAD_STACK(N) with UNUSED u8 sp_pad[N] or similar dummy local buffers as source style.
- preferred_repairs: Clean C is required first; a tactic is accepted only after clean C is shown to fail. | Keep tactics narrow and retain them only with recorded objdiff/regression evidence. | Replace local extern/inlining steering with source structure or small helper layers. | Use PAD_STACK(N) for intentional stack padding instead of manual UNUSED sp_pad arrays, and retain it only with recorded objdiff evidence.
- example matching-pad-stack-sp-pad: BAD `s32 sp[4]; UNUSED u8 sp_pad[8]; s32 i;  UseStack(sp);` → PREFERRED `s32 sp[4]; s32 i;  PAD_STACK(8);  UseStack(sp); /* Keep stack padding narrow and backed by objdiff evidence. */`
- example matching-helper-replaces-dummy-local: BAD `u8 pad[8];  result = CalculateA1(item, state); return result;` → PREFERRED `static inline s32 inlineA1(Item* item, s32 state) {     return CalculateA1(item, state); }  return inlineA1(item, state)`
- example sdata2-order-helper: BAD `void mnDiagram_80241310(s32 arg0, s32 arg1, s32 arg2) {     /// @todo Constant-pool anchors: these dead literals emit no` → PREFERRED `/// @todo .sdata2 order hack static void order_sdata2(void) {     (void) -1.0f;     (void) S32_TO_F32; } /* Keep unavoid`

## global_standard:avoid-pragmas-register-asm  [global/codegen_tactics] status=accepted severity=required rules=['register_keyword', 'inline_asm', 'novel_pragma', 'codegen_pragma']
**New pragmas, register steering, and inline assembly are not allowed in normal source**

- summary: Pragmas, register keywords, and inline assembly are banned in normal decomp source; source that adds them is rejected. | The only permitted exception is a case where reasonable C does not exist, and it must be scoped tightly and carry adjacent-function evidence that it does not harm neighbors.
- do: Scope any permitted pragma with a tight push/pop block; an unbalanced or unscoped pragma is rejected. | A pragma or inline-assembly exception is accepted only with recorded adjacent-function evidence. | Remove register and similar steering; retaining it when it is not required is rejected.
- do_not: Add #pragma global_optimizer off for normal source. | Leave unbalanced or empty pragma blocks. | Use inline assembly outside SDK-like code while reasonable C alternatives remain. | Replace a recoverable C body with raw asm, such as asm BOOL THPInit, while reasonable C remains available.
- preferred_repairs: Remove register, inline asm, and pragma steering from normal source; a narrow exception is accepted only when proven. | A retained pragma must be tightly scoped with validated adjacent functions. | Recover or restore the C implementation for normal functions such as THPInit; raw inline assembly is accepted only when no reasonable C exists.
- example avoid-inline-asm-thpinit: BAD `asm BOOL THPInit(void) {     nofralloc     mflr r0     ... }` → PREFERRED `BOOL THPInit(void) {     /* Recover the C body and keep raw asm out of normal source. */     ... }`
- example avoid-register-keyword: BAD `register HSD_GObj* gobj = fighter; register Fighter* fp = GET_FIGHTER(gobj); return fp->x221F_b4;` → PREFERRED `HSD_GObj* gobj = fighter; Fighter* fp = GET_FIGHTER(gobj); return fp->x221F_b4; /* Do not add register steering as ordin`
- example codegen-pragma-todo-exception: BAD `/// @note Required for un_80300B58 to remain an exact match. #pragma push #pragma global_optimizer off bool un_80300B58(` → PREFERRED `/// @todo Find a solution without the pragma #pragma push #pragma global_optimizer off bool un_80300B58(int arg0) {     `

## global_standard:conservative-naming  [global/names_defines_headers_and_prototypes] status=accepted severity=required rules=['m2c_residue_names']
**Semantic names are allowed only when the role is evidenced**

- summary: Names must improve reviewability without inventing meaning; an invented semantic name is rejected. | A semantic name is required to carry supporting evidence; without it, fn_/lbl_/address-style names must stay, and temp_rXX names must be cleaned once a local role is clear.
- do: Use a semantic name only when source, callsite, data, or review evidence supports the role. | Keep address-style names when meaning is not proven; renaming them without evidence is rejected. | Use short local role names such as fp, ip, gp, gobj, and jobj when roles are clear.
- do_not: Invent semantic names from guesses. | Rename address-style symbols before source meaning is supported. | Leave temp_rXX-style names when a clear local role is known.
- preferred_repairs: Use a semantic name only when local evidence proves the role. | Replace generated temp/var/phi local names with conservative role names when the role is clear.
- example conservative-address-function-name: BAD `s32 mnName_GetUnlockedColumnCount(void) {     return mnName_802388D4(); } /* Semantic name is guessed from behavior only` → PREFERRED `s32 mnName_802388D4(void) {     return count; } /* Keep the address-style name until source or review evidence proves th`
- example conservative-evidenced-name: BAD `static s32 lbl_804D6B10; /* The value is known from map/debugger evidence but the source keeps an address label. */` → PREFERRED `static s32 g_debug_menu_cursor; /* Use the semantic name when source, map, debugger, or callsite evidence proves the rol`
- example naming-m2c-residue-local: BAD `s32 temp_r30 = var_r4 + phi_f1;  return temp_r30;` → PREFERRED `s32 count = value + delta;  return count; /* Use fp, ip, gp, gobj, or jobj when those roles are evidenced. */`

## global_standard:no-define-alias-global-renames  [global/names_defines_headers_and_prototypes] status=accepted severity=required rules=['define_alias']
**Aliasing global renames with defines is not allowed**

- summary: A global, extern, or data symbol is required to have one canonical name backed by source, symbol, map, or review evidence. | Hiding a speculative or convenience rename behind an identifier-to-identifier define is rejected, and duplicate address-commented extern declarations for the same data address are rejected; the only permitted rename is a direct, evidence-backed one.
- do: Preserve existing global, data, and extern names; a rename is accepted only when it is evidence-backed. | Keep one canonical declaration for one known data address in the owning scope. | Perform a real scoped rename only when evidence supports it, and update references directly.
- do_not: Add #define old_name new_name or #define new_name old_name to hide a renamed variable. | Keep two extern declarations with different names for the same address-commented data symbol. | Rename address-style globals to semantic names because an external mirror, decompiler, or AI output guessed the role. | Use a define as an alias to avoid updating call sites or to make a guessed semantic name appear accepted.
- preferred_repairs: Keep one canonical symbol name or perform an evidenced scoped rename directly. | Guessed names and missing declarations hidden behind defines are rejected.
- example define-alias-central-symbol-rename: BAD `#define HSD_AudioGetAuxHeapSize AXDriver_8038E034  size = HSD_AudioGetAuxHeapSize();` → PREFERRED `/* config/GALE01/symbols.txt */ /* Rename .text:0x8038E034 from AXDriver_8038E034 to HSD_AudioGetAuxHeapSize. */ size = `
- example define-alias-duplicate-extern: BAD `extern HSD_Archive* lbl_804D6A40; /* 804D6A40 */ extern HSD_Archive* menu_archive; /* 804D6A40 */ #define menu_archive l` → PREFERRED `extern HSD_Archive* lbl_804D6A40; /* Or perform one evidenced scoped rename and update references directly. */`

## global_standard:truthful-headers-and-includes  [global/names_defines_headers_and_prototypes] status=accepted severity=required rules=['extern_in_c', 'bare_local_prototype', 'shadowed_declaration', 'define_alias']
**Headers, prototypes, and includes must be truthful**

- summary: When a body proves a signature, updating the owning header and removing UNK_RET/UNK_PARAMS is required; leaving a mismatched prototype is rejected. | Established include style is required and require-protos checks must run when prototype or include surfaces change; there are no exceptions to declaring a symbol in its real owning header.
- do: Update prototypes when a function body proves the signature. | Put declarations in the real owning header; a fake source-local declaration is rejected. | Use established local include style and run python configure.py --require-protos when applicable.
- do_not: Add fake source-local declarations when the real header should own them. | Leave mismatched prototypes after recovering a function body. | Hide missing prototypes behind local declarations. | Macro-rename identifiers around an include to dodge prototype conflicts.
- preferred_repairs: Move declarations to the owning header when a body proves the signature. | Remove source-local declarations that hide missing prototypes or same-TU visibility. | Fix the owning header signature and include it normally instead of using #define/#undef prototype shims around the include.
- example headers-include-proto-shim: BAD `#define __THPReadFrameHeader __THPReadFrameHeader_proto #define THPDec_80330158 THPDec_80330158_proto #include <dolphin/` → PREFERRED `#include <dolphin/thp/thp.h>  /* dolphin/thp/thp.h owns the recovered signatures. */ static u8 __THPReadFrameHeader(THPF`
- example truthful-source-local-prototype: BAD `/* gmresult.c */ u32 Ground_801C1DAC(void);  void gmResult_80174468(void) {     Ground_801C1DAC(); }` → PREFERRED `/* ground.h */ u32 Ground_801C1DAC(void);  /* gmresult.c */ #include <melee/gr/ground.h>  void gmResult_80174468(void) {`
- example truthful-header-prototype: BAD `/* mnname.h */ UNK_RET mnName_802388D4(UNK_PARAMS);  /* mnname.c */ s32 mnName_802388D4(s32 slot) { return slot + 1; }` → PREFERRED `/* mnname.h */ s32 mnName_802388D4(s32 slot);  /* mnname.c */ s32 mnName_802388D4(s32 slot) { return slot + 1; }`
- example truthful-pointer-return-storage-boundary: BAD `int grHomeRun_8021EC58(int arg);  gp->gv.unk.xCC = grHomeRun_8021EC58(0); text = (HSD_Text*) gp->gv.unk.xCC;` → PREFERRED `HSD_Text* grHomeRun_8021EC58(int arg);  gp->gv.unk.xCC = (intptr_t) grHomeRun_8021EC58(0); text = (HSD_Text*) (intptr_t)`

## global_standard:natural-loops  [global/authored_source_shape] status=accepted severity=required rules=['m2c_goto_label', 'm2c_residue_names']
**Natural loops are required; repeated generated blocks are rejected**

- summary: Repeated blocks that vary by an index, pointer, flag slot, or stride are original loops and must be recovered as natural for/while/do-while forms, including exact int counters when MWCC loop shape matters. | Keeping copied generated blocks is rejected; the only permitted exception is an unrolled shape retained after recorded evidence shows every natural loop form fails.
- do: Use for, while, or do while when repeated source differs only by index, pointer, counter, or stride; a retained copied block is rejected. | Keep the original base pointer available when later code still needs it. | Record verifier evidence when every cleaner loop form fails and an unrolled shape must remain.
- do_not: Leave repeated generated-looking blocks because they currently match. | Mutate the only base pointer copy when later codegen still needs the base address. | Ship unrolled code as finished source without recorded evidence that natural loop forms fail.
- preferred_repairs: Recover natural for/while/do-while forms; a retained repeated generated block is accepted only with recorded negative evidence. | Preserve the original base pointer when later code still needs it.
- example natural-loop-pointer-stride: BAD `if (count != 0) {     cur = groups;     do {         HSD_SynthSFXGroupDataReaddress(cur);         cur++;         count--` → PREFERRED `for (i = 0; i < count; i++) {     HSD_SynthSFXGroupDataReaddress(&groups[i]); } /* Keep the source loop zero-or-more and`
- example natural-loop-indexed-slots: BAD `chars[0] = opp_data[0].x3; chars[1] = opp_data[1].x3; chars[2] = opp_data[2].x3; chars[3] = opp_data[3].x3;` → PREFERRED `for (i = 0; i < count; i++) {     chars[i] = opp_data[i].x3; } /* Test generated-looking adjacent copies as a counted lo`
- example natural-loop-break-hitboxes: BAD `if (hitbox0 != NULL && HitboxCollides(hitbox0)) return true; if (hitbox1 != NULL && HitboxCollides(hitbox1)) return true` → PREFERRED `for (i = 0; i < ARRAY_SIZE(hitboxes); i++) {     if (hitboxes[i] != NULL && HitboxCollides(hitboxes[i])) {         retur`

## global_standard:infer-authored-source-style  [global/authored_source_shape] status=accepted severity=required rules=[]
**Authored source style must be inferred from local analogs**

- summary: Matching is required to reconstruct the likely original authored source, not arbitrary C that moves a score; a shape that only moves a score is rejected. | Matched siblings, nearby files, headers, macros, naming habits, control-flow idioms, and review evidence are required inputs for inferring the original developers' local standards before any generated, permuter-shaped, or data-driven source is retained.
- do: Treat matched local source and headers as authoritative evidence for how original developers in the subsystem wrote loops, helpers, names, declarations, macros, and access patterns. | A retained source hypothesis is required to fit local authored style and verify with objdiff; one that only chases data parity or decompiler output is rejected. | Record negative evidence when local analogs contradict a generated or external suggestion. | When review identifies a repeated issue class, sweep the touched files or change set for the same pattern; fixing only the commented hunks is not accepted.
- do_not: Retain generated, permuter-shaped, or data-driven source when nearby human-written code shows a cleaner local convention. | Let external mirrors, decompiler output, AI output, or data-section parity outrank matched local source and headers. | Call a fake or unusual shape reviewable because it improves a fuzzy score.
- preferred_repairs: Compare against matched local siblings, headers, macros, and naming habits before retaining generated or permuter-shaped source. | Retain generated-looking source only with recorded negative evidence that a cleaner authored form does not exist. | After one review comment exposes a pattern, search touched files for the same generated or tactic-shaped form and repair all instances.
- example authored-style-local-inline-count: BAD `PAD_STACK(8); count = 0; if (mnEvent_8024D1E4(0) != 0) count++; if (mnEvent_8024D1E4(1) != 0) count++; if (mnEvent_8024D` → PREFERRED `static inline s32 mnEvent_CountUnlocked(void) {     s32 i;     s32 count = 0;      for (i = 0; i < 3; i++) {         if `
- example authored-style-local-helper: BAD `if (vel->x < 0.0F) {     vel->x = -vel->x; } if (vel->y < 0.0F) {     vel->y = -vel->y; }` → PREFERRED `static inline void likelikeVelocity(Vec3* vel) {     vel->x = ABS(vel->x);     vel->y = ABS(vel->y); }  likelikeVelocity`
- example authored-style-pragma-only: BAD `#pragma push #pragma global_optimizer off static void pool_data_wrapper(void) {     pool_data(); } #pragma pop` → PREFERRED `static void pool_data_wrapper(void) {     pool_data(); } /* Keep searching when the pragma shape is not likely authored `

## global_standard:canonical-control-flow-and-macros  [global/authored_source_shape] status=accepted severity=required rules=['m2c_goto_label', 'define_alias']
**Canonical control flow and expression macros are required**

- summary: Generated branch ladders, gotos, repeated select-like assignments, and raw absolute/min/max expressions must be recovered as normal source forms such as switch, ternary, ABS, MIN, MAX, and CLAMP. | Shipping the generated form instead is rejected; the only permitted exception is a case where recorded local evidence proves the canonical form does not represent the source.
- do: Use grouped switch forms for range dispatch or adjacent branches. | Use ternaries for select-like assignments. | Use project macros such as ABS, MIN, MAX, and CLAMP when they express the source operation; ignoring them when the assembly shape indicates them is rejected.
- do_not: Ship generated gotos or branch ladders without recovering the ordinary C form. | Replace readable control flow with fake code for one local sequence. | Ignore common expression macros when assembly shape indicates them.
- preferred_repairs: Recover structured switches, ternaries, and canonical ABS/MIN/MAX/CLAMP forms instead of landing generated branch residue. | Remove generated block labels and local macro clones; retain them only when local evidence proves an exception.
- example canonical-switch-dispatch: BAD `if (kind == 0) goto lbl_idle; if (kind == 1) goto lbl_walk; if (kind == 2) goto lbl_jump; goto lbl_default;` → PREFERRED `switch (kind) { case 0: return idle(); case 1: return walk(); case 2: return jump(); default: return fallback(); }`
- example canonical-abs-macro: BAD `if (handpos.x < 0.0F) {     handpos.x = -handpos.x; }` → PREFERRED `handpos.x = ABS(handpos.x); /* Use the project macro when it expresses the source operation. */`
- example canonical-ternary-select: BAD `if (random < 0.5F) {     choice = left; } else {     choice = right; }` → PREFERRED `choice = random < 0.5F ? left : right; /* Try the select expression when it is the natural source form. */`

## global_standard:verification-and-regression-ledger  [global/pipeline_owned_verification] status=workflow_only severity=workflow_only rules=[]
**Claim matches only with build, objdiff, and regression evidence**

- summary: Every claimed matched symbol, score candidate, or source cleanup must name the narrow build/objdiff/checkdiff evidence and any adjacent regression checks needed for the edit's blast radius.
- do: Run narrow touched-object builds when possible. | Run objdiff or checkdiff for claimed matches or score candidates. | Inspect adjacent functions when changing pragmas, includes, data, literals, or TU ownership.
- do_not: Claim a match without local build and objdiff/checkdiff evidence. | Hide regressions behind a broad builds-locally statement. | Mix tooling changes and decomp source changes when either can be reviewed separately.
- preferred_repairs: Use runner-owned build, objdiff, checkdiff, regression, and QA artifacts as the verification ledger. | Do not duplicate manual ledger requirements inside code-quality standards.
- example verification-contradictory-claim: BAD `/* Verification note */ All touched functions are 100 percent in objdiff. Bot report: mnName_GetColumnCount is 98.72 per` → PREFERRED `/* Verification note */ Verified exact: fn_8018846C, mnName_802388D4. Not exact: mnName_GetColumnCount at 98.72 percent.`
- example verification-split-report-interpretation: BAD `Old unit: function_a broken Old unit: function_b broken /* The report is treated as a regression without checking whethe` → PREFERRED `Old unit: function_a moved to new TU New unit: function_a exact Old unit: function_b moved to new TU New unit: function_`
- example verification-assert-conversion-todo: BAD `HSD_ASSERT(0x88, ptr); /* This conversion changes object bytes, but it is kept anyway. */` → PREFERRED `if (ptr == NULL) {     __assert(__FILE__, 0x88, "ptr"); } /* @todo: Find the byte-matching assert macro form before conv`

## global_standard:no-symbol-forgery  [global/source_fidelity] status=accepted severity=required rules=['mangled_symbol_in_source', 'manual_vtable', 'header_override_macro', 'local_class_shadows_header']
**Do not forge symbols the compiler would emit from real source**

- summary: Accepted 2026-09-16 with implemented lint rules; see audits/sms-worktree-source-quality-2026-09-16/REPORT.md Part 4. | Hand-mangled globals (`mFoo__6TClass`), `extern "C"` blocks in C++ game code, hand-written `__vt__` arrays, header-guard predefines, and rename macros wrapped around an include all fabricate a symbol or layout the compiler would only emit from a real declaration; source that adds them is rejected. | A file-scope placeholder `class X` in a .cpp that the include tree already defines violates the one-definition rule and hides the owning header; it is rejected even when the bytes match.
- do: Declare static members in the owning class and define them as `T TClass::mMember = value;` in the unit the map assigns. | Get vtables from the class definition and its virtual methods; write the methods, not the table. | Include the owning header and widen or fix its layout there when the map proves the unit owns the symbol.
- do_not: Write a mangled identifier, `extern "C"`, or `(void*)<mangled>` in a .cpp to reach a symbol without its declaration. | Predefine `<NAME>_HPP` / `_H` or `#define Ident Other` around an include to skip or rewrite a header. | Define a second `class X` at file scope when include/ already defines `X`.
- preferred_repairs: Replace each mangled global with a real static-member definition in the owner. | Replace each hand vtable with the class's virtual methods. | Delete guard predefines and rename macros; include the header and fix the declaration there. | Delete the placeholder class; include the header that defines it.
- example symbol-forgery-manual-vtable: BAD `static void* killer_vtable_padding[16] = { 0 };  void* __vt__7TKiller[] = { 	0, 	0, 	(void*)__dt__7TKillerFv, 	(void*)ge` → PREFERRED `class TKiller : public TSmallEnemy { public: 	TKiller(const char*); 	virtual ~TKiller(); 	virtual void load(JSUMemoryInp`
- example symbol-forgery-mangled-global: BAD `float mWaterLeakSpeed__14TCogwheelScale = 0.01f; extern "C" float mRopeWidthX__9TCogwheel = 10.0f; extern "C" float mRop` → PREFERRED `#include <MoveBG/MapObjMare.hpp>  f32 TCogwheelScale::mWaterLeakSpeed = 0.01f; f32 TCogwheel::mRopeWidthX = 10.0f; f32 T`
- example symbol-forgery-header-override-macro: BAD `#define inv_sqrt inv_sqrt(f32); static f32 inv_sqrt_inline #include <JSystem/JGeometry/JGUtil.hpp> #undef inv_sqrt  #inc` → PREFERRED `#include <JSystem/JGeometry/JGUtil.hpp> #include <Camera/Camera.hpp> /* If JGUtil.hpp declares inv_sqrt wrongly, fix the`
- example symbol-forgery-local-class-shadow: BAD `// src/Enemy/killer.cpp class TKiller { public: 	u8 unk0[0x1A0]; 	f32 mSpeed; };` → PREFERRED `#include <Enemy/Killer.hpp> /* Use the header's TKiller; widen its layout there when the map proves the unit owns it. */`

## global_standard:no-inert-emission  [global/source_fidelity] status=accepted severity=required rules=['discarded_expression', 'unused_static_data']
**Do not add inert statements or data to steer section bytes**

- summary: Accepted 2026-09-16 with implemented lint rules; see audits/sms-worktree-source-quality-2026-09-16/REPORT.md Part 4. | Discarded literals (`(void)1.0f;`, `"<TFoo>";`), pure calls whose result is dropped (`strcmp(name, "x");`), `(void)x.member;`, unreferenced file-scope static data, and uncalled static functions do no work; they exist only to emit bytes into .rodata/.sdata/.data. Source that adds them is rejected. | The only tolerated form is an isolated, `@todo`-marked `order_sdata2`-style helper that anchors float order, and even that is cleanup debt.
- do: Recover the code that consumes the literal, string, or data; the bytes follow from real use. | Keep an unavoidable .sdata2 ordering helper isolated in its own `order_*` function with a `@todo` marker. | Delete static data and functions nothing references.
- do_not: Emit constructor labels or strings through discarded `strcmp`/string statements in factory branches. | Cast literals to void in ordinary function bodies to reserve constant-pool slots. | Add `static const` tables or scalars that no code in the unit reads, or keep `force_active` pragmas to retain them.
- preferred_repairs: Replace each discarded statement with the real consumer, or remove it and accept the section gap. | Remove unreferenced static data; if the map proves the unit owns it, recover its user. | Move unavoidable float-order anchors into one marked `order_sdata2` helper.
- example inert-discarded-string-literal: BAD `if (strcmp(name, "Silhouette") == 0) { 	(void)"<TSilhouette>"; 	return nullptr; }` → PREFERRED `if (strcmp(name, "Silhouette") == 0) 	return new TSilhouette("<TSilhouette>");`
- example inert-unused-static-data: BAD `static const int unk2602[] = { 0, 0, 0 }; static const int unk2604[] = { 0x3f800000, 0x3f800000, 0x3f800000 };  void TFo` → PREFERRED `static const JGeometry::TVec3<f32> sZero(0.0f, 0.0f, 0.0f); static const JGeometry::TVec3<f32> sOne(1.0f, 1.0f, 1.0f);  `

## global_standard:evidence-bound-tactics-and-edits  [global/source_fidelity] status=accepted severity=required rules=['dangling_ref_return', 'scalar_member_index', 'fixed_fn_pointer_call', 'storage_widening', 'duplicated_inline_body', 'single_use_wrapper', 'guard_removal', 'unassigned_member_deref', 'arg_order_change', 'cancelling_arithmetic', 'layout_cue_local']
**Tactic locals, widened storage, permuted calls, and dropped guards need recorded evidence**

- summary: Accepted 2026-09-16 with implemented lint rules; see audits/sms-worktree-source-quality-2026-09-16/REPORT.md Part 4. | Staging record for the Part 4.3 amendments to matching-tactics-need-evidence, verification-and-regression-ledger, typed-fields-over-pointer-math, header-inlines, and infer-authored-source-style: it lists the source_fidelity warning and review-tier rules until those records are amended. | A reference returned to a by-value parameter or automatic local, or an index through a pointer to a scalar member, is a C++ defect and is rejected outright; the remaining items (fixed function pointers, widened storage, expanded inline bodies, single-use wrappers, cancelling arithmetic, layout-cue locals, permuted arguments, dropped condition terms, reads of never-assigned members) are repaired or explained with objdiff evidence before submitting the attempt.
- do: Return by value or take the argument by reference when a helper would otherwise hand back a dangling reference. | Declare the real array field in the owning header instead of indexing past a scalar member. | Keep declaration types as the API expects; if a widened type or oversized buffer must stay, record the objdiff benefit. | Call the header inline instead of pasting its body; mark fabricated wrappers with `// fabricated` or a TODO and the evidence.
- do_not: Bind a local function pointer to a fixed function just to call it once. | Permute arguments of a non-commutative call or drop a `&&`/`||` term without checking the target instruction window. | Add `- -x`, `x - 0.0f`, `T self = this`, `T v[1]`, or u64/char unions to shape codegen without evidence.
- preferred_repairs: Fix C++ defects before any matching work. | Fold tactic locals back into expressions unless objdiff evidence is recorded next to them. | Restore the original argument order or guard term and re-validate the function.
- example fidelity-dangling-ref-return: BAD `static inline const JGeometry::TVec3<f32>& scaleVector(JGeometry::TVec3<f32> vector, f32 scale) { 	vector *= scale; 	ret` → PREFERRED `static inline JGeometry::TVec3<f32> scaleVector(const JGeometry::TVec3<f32>& vector, f32 scale) { 	JGeometry::TVec3<f32>`
- example fidelity-scalar-member-index: BAD `for (int i = 0; i < 3; ++i) { 	(&unk2AC)[i] = gpEmitterManager4D2->unkC8[0][0]; }` → PREFERRED `/* header: JPABaseEmitter* mEmitters[3]; */ for (int i = 0; i < 3; ++i) { 	mEmitters[i] = gpEmitterManager4D2->unkC8[0][`
- example fidelity-storage-widening-mtx44: BAD `-		Mtx transform; +		Mtx44 transform; -		MtxPtr ptr = transform; +		MtxPtr ptr = transform + 1;` → PREFERRED `Mtx transform; MsMtxSetXYZRPH(transform, mPosition.x, mPosition.y, mPosition.z, mRotation.x, mRotation.y, mRotation.z); `
- example fidelity-fixed-fn-pointer-call: BAD `f32 (*sqrt)(f32) = JGeometry::TUtil<f32>::sqrt; f32 dist = sqrt(dx * dx + dz * dz);` → PREFERRED `f32 dist = JGeometry::TUtil<f32>::sqrt(dx * dx + dz * dz); /* If the target shows a non-inlined call, find the inline th`
- example fidelity-cancelling-arithmetic: BAD `f32 fVar1 = (local_24.dot(gpCamera->unk124) - -unk90) * -2.0f;` → PREFERRED `f32 fVar1 = (local_24.dot(gpCamera->unk124) + mPlaneD) * -2.0f; /* If the target really negates a stored negative, name `
- example fidelity-duplicated-inline-body: BAD `// src/MoveBG/MapObjBase.cpp f32 x = mPosition.x - other.x; f32 y = mPosition.y - other.y; f32 z = mPosition.z - other.z` → PREFERRED `return (mPosition - other).length(); /* TVec3::length() in include/JSystem/JGeometry/Vec.hpp already has this body. */`
- example fidelity-single-use-wrapper: BAD `static inline f32 dotProduct(const TVec3f& a, const TVec3f& b) { 	return a.x * b.x + a.y * b.y + a.z * b.z; }  /* one ca` → PREFERRED `f32 d = normal.dot(dir); /* or: keep the wrapper only with `// fabricated` and the objdiff evidence that the target need`
- example fidelity-guard-removal: BAD `-	if (mActor != nullptr && mActor->isVisible()) { +	if (mActor->isVisible()) {` → PREFERRED `if (mActor != nullptr && mActor->isVisible()) { /* Keep the null guard unless the target instruction window proves it ab`
- example fidelity-unassigned-member-deref: BAD `class TCoronaParams { public: 	u8 unk0[0x16C]; 	f32 unk16C; };  f32 TCorona::getRadius() { return mParams->unk16C; }` → PREFERRED `#include <MoveBG/CoronaParams.hpp> f32 TCorona::getRadius() { return mParams->mRadius.get(); } /* The header owns the fi`
- example fidelity-arg-order-change: BAD `-	setPollution(mCount, mMax); +	setPollution(mMax, mCount);` → PREFERRED `setPollution(mCount, mMax); /* Restore the original order unless the target window shows the swapped registers. */`
- example fidelity-layout-cue-local: BAD `TDemoCannon* self = this; f32 half = 0.5f; self->mScale = half * mBase;` → PREFERRED `mScale = 0.5f * mBase;`

## global_standard:sms-authored-evidence  [sms/sms_baseline] status=accepted severity=required rules=['sms_intrinsic_bypass']
**Source hypotheses require evidence**

- summary: Prefer plausible authored C++ supported by local source, assembly, mario.MAP and objdiff; leave uncertain work nonmatching with a TODO.
- do: Use matched siblings, original symbols, headers, debug strings and the map. | Recover owning types, methods, enums and helpers rather than raw offsets or invented storage. | Use evidence to support proposed meanings; preserve existing names until explicit maintainer review under sms-name-review.
- do_not: Accept a fakematch solely because its score improves. | Treat decompiler output as stronger evidence than the binary. | Call __fabsf, __frsqrte, __fres or another MSL intrinsic directly where the public wrapper exists, or flip getUnkNN() and unkNN access purely for a frame-size gain.
- preferred_repairs: actor->onLiveFlag(LIVE_FLAG_UNK10); // when supported by source and binary
- example example:sms-authored-evidence-1: BAD `*(u32*)((char*)actor + guessedOffset) |= 0x10;` → PREFERRED `actor->onLiveFlag(LIVE_FLAG_UNK10); // when supported by source and binary`

## global_standard:sms-cpp-format  [sms/sms_baseline] status=accepted severity=required rules=[]
**Use SMS C++ and formatting conventions**

- summary: Use MWCC GC/1.2.5-compatible C++98 and upstream clang-format 21 configuration.
- do: Use tabs for indentation, 80 columns and the WebKit-based upstream .clang-format. | Preserve include order and use project-relative angle-bracket includes. | Preserve the existing RTTI, exception and per-TU compiler flags.
- do_not: Introduce C++11 language features. | Apply Melee include sorting or formatting rules.
- preferred_repairs: #include <Enemy/FireWanwan.hpp>
- example example:sms-cpp-format-1: BAD `auto enemy = nullptr; // C++11 syntax` → PREFERRED `#include <Enemy/FireWanwan.hpp>`

## global_standard:sms-game-code-only  [sms/sms_baseline] status=accepted severity=required rules=['sms_vendor_edit']
**Autonomous edits stay in game code**

- summary: Do not edit SDK, JSystem, MSL, MetroTRK or THPPlayer in an autonomous attempt.
- do: Work on game-owned classes and functions. | Read library interfaces as evidence without changing them.
- do_not: Modify vendor or middleware code to improve a target score.
- preferred_repairs: Select src/Enemy or another game-owned target.
- example example:sms-game-code-only-1: BAD `Edit src/JSystem to force the target to match.` → PREFERRED `Select src/Enemy or another game-owned target.`

## global_standard:sms-initial-sweep-scope  [sms/sms_baseline] status=accepted severity=required rules=[]
**Keep the initial experiment reviewable**

- summary: The initial SMS experiment improves existing game code rather than opening fresh decompiled translation units. Prefer bounded vector-math or inline-callsite improvements supported by evidence.
- do: Choose an existing game-owned function with enough source and binary context. | Treat TVec3 signatures as research evidence; changes under JSystem require separate explicit human-supervised scope. | Keep the patch bounded to what a maintainer can review.
- do_not: Generate new TUs that require a broad cleanup pass. | Treat a suggested vector-math target as permission to edit JSystem.
- example example:sms-initial-sweep-scope-1: BAD `// Generate a fresh TU or rewrite JSystem/TVec3 in an autonomous sweep.` → PREFERRED `// Improve one existing game-side vector-math function using verified interfaces.`

## global_standard:sms-map-research  [sms/sms_baseline] status=accepted severity=required rules=[]
**Use the available map evidence before guessing**

- summary: Extract the maximum relevant information from SMS symbol maps and available corroborating maps from other games. Keep provenance explicit and do not import unsupported assumptions.
- do: Record which maps, revisions and symbols support a name, signature, class shape or inline hypothesis. | Compare related-game maps where available; record missing corroborating sources rather than inventing evidence. | Keep the SDK and middleware edit prohibition even when using their interfaces as research evidence.
- do_not: Ignore known map information in favor of a decompiler guess. | Assume a same-named method in another game has the same ABI or implementation.
- example example:sms-map-research-1: BAD `// Signature guessed despite available map symbols.` → PREFERRED `// Cite SMS map entries and any corroborating map/revision; record unresolved ABI differences.`

## global_standard:sms-map-symbols  [sms/sms_baseline] status=accepted severity=required rules=['sms_symbol_map_validation']
**Reconstruct UNUSED bodies and validate map symbols**

- summary: Recover UNUSED dead-stripped functions from their surviving inline call sites where possible, then compare compiled sizes with mario.MAP. Validate each changed C++ translation unit against the map.
- do: Extract names, signatures, presence, ordering, linked binding and known UNUSED sizes from the map. | Trace all relevant inline call sites to reconstruct an UNUSED body, including assert stubs and real helper boundaries. | Build changed TUs before QA. The SMS gate requires fresh objects and invokes tools/validate-symbol-order.py for every changed game .cpp file. | Preserve validator output, including UNUSED size warnings; a warning is an unresolved hypothesis, not proof of a match. | Account for reverse emission under -inline deferred.
- do_not: Skip map validation because the object is missing or the file is untracked. | Infer UNUSED linkage from the UNUSED marker. | Fill an UNUSED body with invented code merely to match its size.
- preferred_repairs: python tools/validate-symbol-order.py -u mario/MarioUtil/MathUtil
- example example:sms-map-symbols-1: BAD `// UNUSED method body guessed only to reach the map size.` → PREFERRED `// Reconstruct from evidenced inline sites; build and run the symbol-map validator.`

## global_standard:sms-name-review  [sms/sms_baseline] status=accepted severity=required rules=['sms_name_change_requires_review']
**Names require maintainer review**

- summary: Preserve existing names in autonomous output. Propose inferred semantic names separately for explicit maintainer review; evidence alone is not naming approval.
- do: Keep existing function, type, member, parameter, local and symbol-map names. | Record a proposed name with its original name, location and evidence for human review. | Have a human integrate approved naming changes separately into the accepted base before resuming automated matching.
- do_not: Automatically rename a symbol because the model believes it understands the role. | Suppress a naming finding with a comment or self-authored approval. | Hide a rename behind a macro alias.
- example example:sms-name-review-1: BAD `void guessedSemanticName(); // replaces existingName` → PREFERRED `void existingName(); // propose a rename separately for maintainer review`

## global_standard:sms-names-types-helpers  [sms/sms_baseline] status=accepted severity=required rules=['sms_local_class_needs_owner']
**Recover original classes, names and helpers**

- summary: Use mario.MAP and debug strings for names, signatures, class structure and original helper boundaries.
- do: Use SMS enums and actor accessors when they express the operation. | Keep declarations in their owning headers and preserve known virtual methods and vtable order. | Preserve existing names. Proposed semantic names and renames require explicit maintainer review under sms-name-review.
- do_not: Inject HSD/JObj, FighterVars, GroundVars or ItemVars conventions into SMS. | Invent semantic names or method signatures from a score alone. | Define a placeholder class at file scope in a .cpp; the owning header (per the map unit of __vt__/__dt__/__ct__) declares it, marked fabricated if reconstructed.
- preferred_repairs: liveActor->checkLiveFlag(LIVE_FLAG_UNK10);
- example example:sms-names-types-helpers-1: BAD `Use an unrelated Melee helper or type to model an SMS actor.` → PREFERRED `liveActor->checkLiveFlag(LIVE_FLAG_UNK10);`
- example example:sms-names-types-helpers-2: BAD `// src/MoveBG/MapObjBianco.cpp class TBiancoWatermillVertical { public: 	static f32 mRotAccel; 	static f32 mRotSpeedDown` → PREFERRED `// include/MoveBG/MapObjBianco.hpp (fabricated: reconstructed from __vt__24TBiancoWatermillVertical in this unit) class `

## global_standard:sms-regression-evidence  [sms/sms_baseline] status=accepted severity=required rules=[]
**Retained changes require baseline and regression evidence**

- summary: Create a baseline before edits and run changes_all after them. Preserve local work and report per-symbol regressions.
- do: Run ninja baseline before matching work and ninja changes_all afterward. | Use narrow object builds and objdiff/decomp-diff evidence for the target. | Validate affected neighbors when changing headers, data, inlining or symbol order.
- do_not: Reset or discard pre-existing work. | Claim a match from an aggregate percentage alone.
- preferred_repairs: ninja baseline
# make scoped changes
ninja changes_all
- example example:sms-regression-evidence-1: BAD `Claim success because the project builds.` → PREFERRED `ninja baseline # make scoped changes ninja changes_all`

## global_standard:sms-stack-independent-matching  [sms/sms_baseline] status=accepted severity=required rules=[]
**Improve matching without forcing frame padding**

- summary: Improve genuine source and instruction matching modulo stack-frame padding. If padding is the remaining discrepancy, report it explicitly and stop rather than manufacturing a full match.
- do: Investigate every relevant inline, including (void)0 assert stubs, before attributing a discrepancy to padding. | Use evidence to reconstruct private/public member visibility, method signatures and helper boundaries. | Report actual objdiff scores, remaining stack-frame differences and tested hypotheses separately; do not relabel a partial match as 100%.
- do_not: Invent visibility, members, helpers or storage solely to manipulate the frame size. | Spend the attempt forcing unexplained padding parity after the meaningful source improvement is exhausted.
- example example:sms-stack-independent-matching-1: BAD `char stackPadding[16]; // force 100%` → PREFERRED `// Report the actual score and remaining frame difference; inspect inline assert stubs.`

## global_standard:sms-temporary-tactics  [sms/sms_baseline] status=accepted severity=required rules=['sms_dummy_stack_padding']
**No dummy locals or stack-padding tricks**

- summary: Do not commit dummy arrays, unreferenced locals, partially used aggregates, discarded constructor expressions, fabricated storage or other baseless tricks to force a stack frame match. This applies with or without volatile, regardless of the variable name or type (scalar, Mtx, TVec3, union, array, const reference). | When the frame is the only remaining discrepancy, follow the upstream convention: leave the function nonmatching with a TODO comment (or comment the tactic out) instead of shipping the trick.
- do: Leave the function nonmatching when unexplained frame padding remains; record it with a TODO. | Keep narrow temporary pragmas explicitly annotated, with evidence and adjacent-function checks. | Remove diagnostic padding, unreferenced locals and marker code before submitting the attempt.
- do_not: Commit char trash[4], volatile arrays, renamed unused arrays, or equivalent padding tricks. | Declare any local (Mtx44 transform; TVec3 position; SDLModelData* data; const T& tmp = ...;) that the function never references again. | Keep an aggregate local whose only use is a single component (half.x) to shape the frame. | Write JGeometry::TVec3<f32>(); or another discarded constructor expression as a statement. | Treat annotation as permission to ship a fakematch.
- preferred_repairs: // TODO: temporary matching pragma; record why it is needed.
#pragma dont_inline on
// narrowly scoped code
#pragma dont_inline off
- example example:sms-temporary-tactics-1: BAD `char trash[4];` → PREFERRED `// TODO: nonmatching frame padding remains; no fabricated locals.`
- example example:sms-temporary-tactics-2: BAD `void TBossEel::updateTearsCnt() { 	Mtx44 transform; 	JGeometry::TVec3<f32> position; 	static const s32 eyeTable[] = { 0,` → PREFERRED `void TBossEel::updateTearsCnt() { 	// TODO: frame is 0x20 larger in the retail object; inline not identified. 	static co`

## global_standard:sms-pch-string-convention  [sms/sms_fidelity] status=accepted severity=required rules=['sms_pch_string_convention', 'sms_dummy_vec_helper']
**Use the PCH dummy-string headers, never hand copies**

- summary: Accepted 2026-09-16 with implemented lint rules; see audits/sms-worktree-source-quality-2026-09-16/REPORT.md Part 4. | Translation units that need the retail dummy strings include <System/DummyStrings.hpp> or <M3DUtil/InfectiousStrings.hpp>; they do not redefine dummyMactorStringValue1, SMS_NO_MEMORY_MESSAGE or MtxCalcTypeName, copy their literals under other names, or predefine the header guards to suppress the include. | The upstream static void dummy(Vec*) .rodata emission helper is accepted only with a // dummy: emits <symbols> comment naming the anonymous objects it produces in this unit.
- do: Include the owning header when the target object carries the dummy strings. | Name the emitted .rodata symbols next to a dummy(Vec*) helper so the reviewer can check them against the map.
- do_not: Copy the dummy-string literals into a .cpp under any name or storage class. | Predefine SYSTEM_DUMMY_STRINGS_HPP or M3DUTIL_INFECTIOUS_STRINGS_HPP to change what the include emits. | Add a dummy(Vec*) helper without the evidence comment.
- preferred_repairs: #include <M3DUtil/InfectiousStrings.hpp> | // dummy: emits lit_4321, lit_4322
static void dummy(Vec* v) { *v = (Vec) { 0.0f, 0.0f, 0.0f }; }
- example example:sms-pch-string-convention-1: BAD `// This TU carries the dummy strings, but not their small-data pointers. #define SYSTEM_DUMMY_STRINGS_HPP static const c` → PREFERRED `#include <M3DUtil/InfectiousStrings.hpp> // TODO: .sdata pointer layout differs from the PCH header; left nonmatching.`
- example example:sms-pch-string-convention-2: BAD `static void dummy(Vec* v) { 	*v = (Vec) { 0.0f, 0.0f, 0.0f }; 	*v = (Vec) { 1.0f, 1.0f, 1.0f }; }` → PREFERRED `// dummy: emits the two anonymous 0xC .rodata objects at 0x8038xxxx (see splits) static void dummy(Vec* v) { 	*v = (Vec)`

## global_standard:sms-fabricated-marker  [sms/sms_fidelity] status=accepted severity=required rules=['sms_fabricated_marker']
**Fabricated code carries the upstream marker**

- summary: Accepted 2026-09-16 with implemented lint rules; see audits/sms-worktree-source-quality-2026-09-16/REPORT.md Part 4. | Upstream AGENTS.md accepts temporary fakematch scaffolding only when it is marked: #pragma dont_inline / inline_depth, fabricated static inline helpers, and hand-expanded inline bodies carry // fabricated, // fake, // fakematch or // TODO on the line or within two lines above. Unmarked scaffolding is rejected; marked scaffolding is a warning that stays visible debt. | #pragma force_active is never accepted in game code.
- do: Mark every pragma, single-use helper and expanded inline with the reason and the evidence that motivated it. | Prefer finding the real inline over keeping the marked scaffolding.
- do_not: Commit unmarked dont_inline/inline_depth pragmas or single-use static inline helpers. | Expand a header inline body by hand inside a function. | Use #pragma force_active to keep unreferenced data alive.
- preferred_repairs: // TODO: fakematch, inlining not understood
#pragma dont_inline on
void TBathtubKiller::resetBathtubKiller() { ... }
#pragma dont_inline off | // fabricated: TU-local helper standing in for an unidentified inline
static inline f32 dotProduct(f32 x1, f32 y1, f32 x2, f32 y2)
- example example:sms-fabricated-marker-1: BAD `void TBathtubKiller::reset() { }  #pragma dont_inline on void TBathtubKiller::resetBathtubKiller() { 	mSpine->initWith(&` → PREFERRED `void TBathtubKiller::reset() { }  // TODO: fakematch; resetBathtubKiller must stay out of line, inline cause unknown #pr`
