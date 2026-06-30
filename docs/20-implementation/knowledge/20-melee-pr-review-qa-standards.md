---
covers: Example-backed Melee decomp code-quality standards, QA lint coverage, retired rules, and repair examples
concepts: [review-standards, decomp-quality, matching-standards, qa-checklist, example-backed-standards]
code-ref: projects/melee/knowledge/sources/injectable/decomp_standards/data/standards.jsonl, projects/melee/knowledge/sources/injectable/decomp_standards/data/examples.jsonl, toolpacks/gamecube-decomp/source_editing/review_lint/api/_qa_rules.py
---

# Melee Code Quality Standards

Use these standards for agent-authored Melee C and QA review of review-bound candidate files. Each standard is a short source-quality description backed by concrete bad/preferred code pairs. The examples are the primary teaching surface; metadata and QA rule ids explain how the standard is enforced.

Current source, headers, symbols, splits, assembly, objdiff/checkdiff, and regression output outrank these standards. Change shape policy, review body format, and manual verification ledgers belong to workflow/runbook surfaces.

## Groups At A Glance

| Group | Active standards | Example pairs | What it protects |
| --- | ---: | ---: | --- |
| Authored Source Shape | 3 | 6 | Recover likely authored C instead of preserving generated residue. These standards use local source, nearby matched siblings, macros, and control-flow idioms as the evidence for the preferred shape. |
| Typed Access And Pointer Math | 1 | 4 | Express memory through the most precise known type: fields, union arms, helpers, accessors, or temporary structs before raw pointer arithmetic. |
| Asserts, Reports, And Header Inlines | 2 | 6 | Map expanded assert/report code back to project macros, header inlines, and helper boundaries when file/line evidence identifies the source operation. |
| Literals, Data, And Externs | 2 | 8 | Keep ordinary literals inline unless data ownership evidence proves named storage. Data section pressure is not enough by itself. |
| Codegen Tactics | 2 | 9 | Keep matching tactics narrow and evidenced. Pragmas, register steering, volatile locals, local externs, and dummy locals are exceptions, not source style. |
| Names, Defines, Headers, And Prototypes | 3 | 8 | Improve names, declarations, and headers only when source evidence supports them. Do not hide guesses behind aliases or local externs. |

## Enforcement Tiers

| Tier | Meaning | Example rule ids |
| --- | --- | --- |
| Deterministic error | Added diff shape is mechanically rejected or maintainer-rejected. | `new_data_anchor`, `self_tu_extern`, `packed_string_blob`, `copied_jobj_inline`, `unrolled_assert`, `register_keyword`, `inline_asm`, `m2c_field_use`, `define_alias` |
| Deterministic warning | Added diff shape is suspicious but context can justify it. | `extern_literal_anchor`, `function_extern_visibility`, `novel_pragma`, `type_erasing_cast`, `pointer_offset_arithmetic`, typed `spNN` locals |
| Pre-ship review | Judgment needs local source analogs, type context, or objdiff reasoning. | likely loops, one-off helpers, authored-source style, semantic naming |
| Pipeline-owned verification | Runner/build evidence proves whether retained source matches. | `ninja`, objdiff/checkdiff, regression-check, worker validation artifacts |

## Authored Source Shape

Recover likely authored C instead of preserving generated residue. These standards use local source, nearby matched siblings, macros, and control-flow idioms as the evidence for the preferred shape.

### Recover natural loops before preserving repeated generated blocks

Standard id: `global_standard:natural-loops`

- Repeated blocks that vary by an index, pointer, flag slot, or stride are often original loops.
- Try natural for/while/do-while forms, including exact int counters when MWCC loop shape matters, before keeping copied generated blocks.

QA coverage: `m2c_goto_label`, `m2c_residue_names`.
Severity: `review_required`; enforcement: `partial_lint_plus_pre_ship_review`.

#### Example 1: Authored Source Natural Loop

severity: `pre_ship_review`.

Bad:

```c
slot[0] = base[0].x4;
slot[1] = base[1].x4;
slot[2] = base[2].x4;
```

Preferred:

```c
for (i = 0; i < 3; i++) {
    slot[i] = base[i].x4;
}
```

Why this example represents the standard:

- Repeated blocks that differ only by an index or stride are often original loops.
- Test the authored loop form before landing copied generated blocks.

#### Example 2: Authored Source Indexed Copy Loop

severity: `pre_ship_review`.

Bad:

```c
chars[0] = opp_data[0].x3;
chars[1] = opp_data[1].x3;
chars[2] = opp_data[2].x3;
chars[3] = opp_data[3].x3;
```

Preferred:

```c
for (i = 0; i < count; i++) {
    chars[i] = opp_data[i].x3;
}
/* Test generated-looking adjacent copies as a counted loop. */
```

Why this example represents the standard:

- Repeated adjacent assignments that only advance an index should be tested as a natural loop.
- The reviewer-facing lesson is to avoid preserving unrolled generated residue when a counted loop matches the local source shape.

### Infer authored source style from local analogs

Standard id: `global_standard:infer-authored-source-style`

- Matching should reconstruct likely original authored source, not arbitrary C that moves a score.
- Use matched siblings, nearby files, headers, macros, naming habits, control-flow idioms, and review evidence to infer the original developers' local standards before preserving generated, permuter-shaped, or data-driven source.

QA coverage: pre-ship review / local evidence.
Severity: `review_required`; enforcement: `pre_ship_review`.

#### Example 1: Authored Style Local Helper

severity: `pre_ship_review`.

Bad:

```c
if (vel->x < 0.0F) {
    vel->x = -vel->x;
}
if (vel->y < 0.0F) {
    vel->y = -vel->y;
}
```

Preferred:

```c
static inline void likelikeVelocity(Vec3* vel)
{
    vel->x = ABS(vel->x);
    vel->y = ABS(vel->y);
}

likelikeVelocity(&item->x40_vel);
```

Why this example represents the standard:

- Nearby authored helper style can be stronger evidence than preserving bulky generated-looking collision logic.
- The cleanup should fit the local item code shape rather than only mirror a decompiler output form.

#### Example 2: Authored Style Pragma Only

severity: `warning`; rule: `novel_pragma`.

Bad:

```c
#pragma push
#pragma global_optimizer off
static void pool_data_wrapper(void)
{
    pool_data();
}
#pragma pop
```

Preferred:

```c
static void pool_data_wrapper(void)
{
    pool_data();
}
/* Keep searching when review says the pragma shape is not likely authored source. */
```

Why this example represents the standard:

- A narrow objdiff benefit does not automatically make a source shape reviewable.
- When reviewer feedback says a tactic is unlikely authored source, prefer local analogs or a cleanup path over enshrining the tactic.

### Use canonical control flow and expression macros

Standard id: `global_standard:canonical-control-flow-and-macros`

- Generated branch ladders, gotos, repeated select-like assignments, and raw absolute/min/max expressions should be checked against normal source forms such as switch, ternary, ABS, MIN, MAX, and CLAMP.

QA coverage: `m2c_goto_label`, `define_alias`.
Severity: `review_required`; enforcement: `partial_lint_plus_pre_ship_review`.

#### Example 1: Canonical Goto Dispatch Switch

severity: `warning`; rule: `m2c_goto_label`.

Bad:

```c
if (kind == 0) goto lbl_idle;
if (kind == 1) goto lbl_walk;
if (kind == 2) goto lbl_jump;
goto lbl_default;
```

Preferred:

```c
switch (kind) {
case 0: return idle();
case 1: return walk();
case 2: return jump();
default: return fallback();
}
```

Why this example represents the standard:

- Generated-looking dispatch chains should be checked against grouped switch forms.
- This shape is goto residue; grouped switch dispatch is clearer and usually closer to authored source.

#### Example 2: Canonical Ternary Select

severity: `pre_ship_review`.

Bad:

```c
if (handpos.x < 0.0F) {
    handpos.x = -handpos.x;
}
choice = random < 0.5F ? left : right;
```

Preferred:

```c
handpos.x = ABS(handpos.x);
choice = random < 0.5F ? left : right;
/* Use the project macro or select form when it is the natural expression. */
```

Why this example represents the standard:

- Absolute-value and select-like assignment code should be tested against canonical expression forms.
- The standard is checking for readable source idioms that also match the observed code shape.

## Typed Access And Pointer Math

Express memory through the most precise known type: fields, union arms, helpers, accessors, or temporary structs before raw pointer arithmetic.

### Prefer typed fields, union arms, and accessors over pointer math

Standard id: `global_standard:typed-fields-over-pointer-math`

- When a type can describe an access, prefer real fields, correct FighterVars/GroundVars/ItemVars union arms, accessors, or temporary internal structs before M2C_FIELD and raw pointer arithmetic.

QA coverage: `stage_ground_var_owner`, `m2c_field_use`, `type_erasing_cast`, `pointer_offset_arithmetic`.
Severity: `repair_required`; enforcement: `partial_hard_lint_plus_warning`.

#### Example 1: Typed Pointer Offset Player State

severity: `warning`; rule: `pointer_offset_arithmetic`.

Bad:

```c
value = *(s32*) (
    (u8*) state + 0x14 + pnum * 0x24
);
```

Preferred:

```c
value = state->players[pnum].x14;
/* Keep the access on the recovered typed field. */
```

Why this example represents the standard:

- Raw byte math hides a recoverable typed field/array access and tends to preserve generated output instead of authored source.

#### Example 2: Typed Stage Ground Vars Owner

severity: `error`; rule: `stage_ground_var_owner`.

Bad:

```c
/* grbigblue.c */
gp->gv.arwing.xC8 = 0;
```

Preferred:

```c
/* grbigblue.c */
gp->gv.bigblue.xC8 = 0;
/* Add the owning bigblue GroundVars field first when it is missing. */
```

Why this example represents the standard:

- Borrowing another stage family's union arm because offsets line up hides the owning stage type and is a recurring maintainer rejection.

#### Example 3: Typed Attribute Union Access

severity: `warning`; rule: `type_erasing_cast`.

Bad:

```c
value = ((S32Vec3*) attr->x0)->x;
height = ((Vec3*) attr->x0)->y;
/* The same slot is being reinterpreted at each use site. */
```

Preferred:

```c
value = attr->x0.x0_s32->x;
height = attr->x0.x0_f32->y;
/* Recover the union arm once and use the typed access at each site. */
```

Why this example represents the standard:

- When one attribute slot is used through multiple concrete views, model that in the type instead of scattering casts.
- The standard is checking for recoverable typed access, not just syntactic pointer arithmetic.

#### Example 4: Typed Adjacent Table Symbol

severity: `warning`; rule: `pointer_offset_arithmetic`.

Bad:

```c
#define GRFZ_ANIM_ROWS(base) ((grFz_AnimRow*) ((base) + 0x94))

s16* tbl = (s16*) grFz_803E7940;
row_entry = GRFZ_ANIM_ROWS(tbl)[state].entries[slot];
```

Preferred:

```c
s16* tbl = grFz_803E7A68;
row_entry = tbl[state * 5 + slot];
/* Use the real table symbol instead of offsetting from adjacent unrelated data. */
```

Why this example represents the standard:

- A macro or cast that offsets from one global into nearby data can hide a wrong data-owner hypothesis.
- When symbol metadata shows a separate table starts at its own address, use that table symbol directly rather than deriving it from an adjacent callback or config object.

## Asserts, Reports, And Header Inlines

Map expanded assert/report code back to project macros, header inlines, and helper boundaries when file/line evidence identifies the source operation.

### Use existing inlines/helpers instead of keeping expanded bodies

Standard id: `global_standard:header-inlines`

- Expanded header asserts, especially from jobj.h, should be mapped back to the existing inline/helper when line numbers and local evidence identify the source-level operation.
- Local helper boundaries should also be restored when duplicated expanded bodies or sibling functions show an authored helper shape.

QA coverage: `copied_jobj_inline`, `unrolled_assert`.
Severity: `repair_required`; enforcement: `partial_hard_lint_plus_repair_hints`.

#### Example 1: Header Inline Copied Jobj Body

severity: `error`; rule: `copied_jobj_inline`.

Bad:

```c
static inline void LocalSetDirty(HSD_JObj* jobj)
{
    if (jobj == NULL) {
        __assert("jobj.h", 0x2F4, "jobj");
    }
    jobj->flags |= JOBJ_MTX_DIRTY;
}
```

Preferred:

```c
HSD_JObjSetMtxDirtySub(jobj);
/* Or add the missing helper at the owning HSD_JObj API layer. */
```

Why this example represents the standard:

- Pasting jobj.h inline bodies into unrelated TUs duplicates header logic and usually indicates an expanded inline was not recovered.

#### Example 2: Header Inline Jobj Helper

severity: `error`; rule: `copied_jobj_inline`.

Bad:

```c
static inline void LocalSetMtxDirty(HSD_JObj* jobj)
{
    if (jobj == NULL) {
        __assert("jobj.h", 0x2F4, "jobj");
    }
    jobj->flags |= JOBJ_MTX_DIRTY;
}
```

Preferred:

```c
HSD_JObjSetMtxDirty(jobj);
/* Or use the shared WithMtxDirty variant when that is the evidenced helper. */
```

Why this example represents the standard:

- Local fake helpers that mirror jobj.h asserts and writes should be compared against the owning header helper.
- The fix path is to recover the canonical helper rather than copy the inline body into each TU.

#### Example 3: Header Inline Local Quicksort

severity: `pre_ship_review`.

Bad:

```c
void sort_ascending(TySortElem* base, s32 lo, s32 hi)
{
    /* Full quicksort body is pasted here. */
}

void sort_descending(TySortElem* base, s32 lo, s32 hi)
{
    /* Nearly the same quicksort body is pasted again. */
}
```

Preferred:

```c
static inline void quicksort(TySortElem* base, s32 lo, s32 hi)
{
    /* Shared evidenced helper body. */
}

void sort_ascending(TySortElem* base, s32 lo, s32 hi)
{
    PAD_STACK(16);
    quicksort(base, lo, hi);
}
```

Why this example represents the standard:

- Expanded sibling helper bodies should be compared against a shared local inline/helper boundary.
- Restoring a shared helper shape avoids leaving duplicated expanded logic in sibling functions.

### Use project assert and report macros when they represent the source

Standard id: `global_standard:assert-report-macros`

- Raw assert/report expansions should usually become HSD_ASSERT, HSD_ASSERTMSG, HSD_ASSERTREPORT, OSReport, or OSPanic forms when the file, line, message, and side effects match local project idioms.

QA coverage: `unrolled_assert`, `fake_assert_macro`, `assert_idiom_downgrade`.
Severity: `repair_required`; enforcement: `hard_lint`.

#### Example 1: Assert Raw Jobj Helper

severity: `error`; rule: `unrolled_assert`.

Bad:

```c
if (jobj == NULL) {
    __assert("jobj.h", 0x257, "jobj");
}
```

Preferred:

```c
HSD_ASSERT(0x257, jobj);
/* If the line identifies a recovered inline, call the matching HSD_JObj* helper. */
```

Why this example represents the standard:

- Raw assert expansion is not the source idiom.
- Jobj.h line numbers often identify an existing header inline/helper.

#### Example 2: Assert Report Macro Osreport

severity: `error`; rule: `unrolled_assert`.

Bad:

```c
if (archive == NULL) {
    OSReport("archive is null\n");
    __assert(__FILE__, 0x154, "archive");
}
```

Preferred:

```c
HSD_ASSERTREPORT(0x154, archive, "archive is null\n");
/* Preserve the report side effect while using the project macro form. */
```

Why this example represents the standard:

- Plain raw assert blocks are not the same as report-bearing assert blocks.
- Use the macro family member that preserves message and report behavior.

#### Example 3: Assert Fake Message Helper

severity: `error`; rule: `unrolled_assert`.

Bad:

```c
static inline char* grKongo_801D828C_TaruKeepMsg(void)
{
    return &grKg_803E1A00[0];
}

if (gp->gv.kongo.u.taru.keep == NULL) {
    __assert(grKg_803E1858, 1719, grKongo_801D828C_TaruKeepMsg());
}
```

Preferred:

```c
HSD_ASSERT(1719, gp->gv.kongo.u.taru.keep);
/* Do not invent helper functions or data symbols just to feed assert text. */
```

Why this example represents the standard:

- A helper whose only purpose is to supply assert text is a generated/data-order tactic, not authored source style.
- Use HSD_ASSERT for plain assertions; reserve HSD_ASSERTMSG for real custom messages with source evidence.

## Literals, Data, And Externs

Keep ordinary literals inline unless data ownership evidence proves named storage. Data section pressure is not enough by itself.

### Keep literals inline unless data ownership evidence says otherwise

Standard id: `global_standard:literals-and-data-ownership`

- Do not promote strings, floats, or constants into named storage just because generated output exposed an address.
- Check section ownership, symbol metadata, split boundaries, and local source patterns first.

QA coverage: `extern_literal_anchor`, `new_data_anchor`, `self_tu_extern`, `numeric_literal_to_symbol`, `address_named_static_data`, `banned_pattern:*`, `resubmission_tombstone`.
Severity: `repair_required`; enforcement: `hard_lint_plus_warning`.

#### Example 1: Data Extern Float Anchor

severity: `error`; rule: `new_data_anchor`.

Bad:

```c
extern const f32 lbl_804DA60C;

speed = lbl_804DA60C;

const f32 lbl_804DA60C = 1.0F;
```

Preferred:

```c
speed = 1.0F;
/* Keep named data only when symbol metadata and section ownership prove it. */
```

Why this example represents the standard:

- Introducing extern, use, and definition together creates a data-order anchor instead of recovering source ownership.

#### Example 2: Literal Zero Float Inline

severity: `error`; rule: `numeric_literal_to_symbol`.

Bad:

```c
static const f32 it_804DC878 = 0.0F;

itDosei_FacingAngle(gobj, it_804DC878);
```

Preferred:

```c
itDosei_FacingAngle(gobj, 0.0F);
/* Ordinary constants stay inline unless ownership evidence proves named storage. */
```

Why this example represents the standard:

- A named float used only to stand in for an ordinary literal is a data-ownership claim.
- Keeping named storage for an ordinary zero literal creates an unnecessary data object; inline the literal at the call site unless ownership is proven.

#### Example 3: Literal Address Floats Inline

severity: `error`; rule: `numeric_literal_to_symbol`.

Bad:

```c
static const f32 un_804DDF74 = 0.0F;
static const f32 un_804DDF70 = 7.0F;

angle = *(f32 const*) &un_804DDF74;
limit = *(f32 const*) &un_804DDF70;
```

Preferred:

```c
angle = 0.0f;
limit = 7.0f;
/* Keep ordinary float literals inline unless section ownership proves named data. */
```

Why this example represents the standard:

- Address-named float statics that only stand in for ordinary values such as 0.0f, 7.0f, -3000.0F, and 3000.0F are fake data ownership.
- The repair is to remove the fake data symbol use and keep the literal at the source site.

#### Example 4: Literal Unused Float Anchors

severity: `error`; rule: `new_data_anchor`.

Bad:

```c
const f32 grPu_804DBA70 = 0.0;
const f32 grPu_804DBA74 = 2.0;
const f32 grPu_804DBA78 = 30.0;
const f32 grPu_804DBA7C = -30.0;
```

Preferred:

```c
/* Delete unused address-named float anchors. */
/* Keep numeric values inline at use sites, or fix metadata when real data ownership is proven. */
```

Why this example represents the standard:

- Unused address-named constants are dummy data anchors even when the names look like local TU symbols.
- Delete them unless section/symbol evidence proves a real source object; ordinary numeric values should stay inline at source use sites.

#### Example 5: Literal Unused Archive String Anchors

severity: `error`; rule: `address_named_static_data`.

Bad:

```c
char lbl_803F9768[0x16] = "ScInfCnt_scene_models";

lbArchive_LoadSections(*archive, (void**) &models,
                       "ScInfCnt_scene_models", 0);
```

Preferred:

```c
lbArchive_LoadSections(*archive, (void**) &models,
                       "ScInfCnt_scene_models", 0);
/* Delete unused address-named archive string anchors unless ownership evidence proves real storage. */
```

Why this example represents the standard:

- Leaving an address-named string global beside an inline archive section literal is a data-order anchor, not source recovery.
- Keep resource names inline at the call site and remove unused generated string globals.

### Do not replace string literals with data symbols

Standard id: `global_standard:no-string-literal-symbol-regression`

- String literals used as asset names, resource labels, assert/report text, and table labels should stay inline for code-matching PRs.
- Replacing a literal with a generated or global data symbol is data work and a regression unless evidence and change scope justify it.

QA coverage: `extern_literal_anchor`, `string_literal_to_symbol`, `packed_string_blob`, `banned_pattern:*`, `resubmission_tombstone`.
Severity: `repair_required`; enforcement: `hard_lint`.

#### Example 1: String Packed Blob Offset

severity: `error`; rule: `packed_string_blob`.

Bad:

```c
static char lbl_803EFB60[0xA8] = "Can't get user_data.\n\0\0\0";

OSReport(lbl_803EFB60 + 0x28);
```

Preferred:

```c
OSReport("Can't get user_data.\n");
/* Recover a real evidenced string table only when source ownership proves it. */
```

Why this example represents the standard:

- Packed string blobs and offset accessors are data-ordering dodges when ordinary source strings should remain inline.

#### Example 2: String Asset Label Inline

severity: `error`; rule: `string_literal_to_symbol`.

Bad:

```c
extern char mnNameNew_803EE38C[];

HSD_ArchiveGetPublicAddress(archive, mnNameNew_803EE38C);
```

Preferred:

```c
HSD_ArchiveGetPublicAddress(archive, "MenMainBack_Top_joint");
/* Keep ordinary asset labels inline unless data ownership is the explicit scope. */
```

Why this example represents the standard:

- Asset and resource labels should not become address-style globals just to chase relocation or data layout.
- Reviewer feedback in the MN split treated this string-to-symbol replacement as a regression.

#### Example 3: String Archive Section Inline

severity: `error`; rule: `string_literal_to_symbol`.

Bad:

```c
lbArchive_LoadSections(arg0, (void**) &AutoNamesList,
                       mnNameNew_803EE6D0, &NotAllowedNamesList,
                       mnNameNew_803EE6E4, NULL);
```

Preferred:

```c
lbArchive_LoadSections(arg0, (void**) &AutoNamesList,
                       "mnNameAutoNameUs", &NotAllowedNamesList,
                       "mnNameRefuseNameUs", NULL);
/* Archive section/resource names stay inline unless data ownership is the reviewed scope. */
```

Why this example represents the standard:

- Archive section names are ordinary resource string literals at call sites.
- Do not replace them with address-style string symbols just because the strings also exist in recovered data.

## Codegen Tactics

Keep matching tactics narrow and evidenced. Pragmas, register steering, volatile locals, local externs, and dummy locals are exceptions, not source style.

### Matching tactics require targeted evidence

Standard id: `global_standard:matching-tactics-need-evidence`

- PAD_STACK, declaration order changes, widened local lifetimes, dummy locals, volatile locals, manual inline expansion, direct global access, and temporary padded structs need explicit build/objdiff/regression evidence before they remain in reviewable source.

QA coverage: `function_extern_visibility`, `same_tu_function_extern`, `volatile_local_tactic`.
Severity: `evidence_required`; enforcement: `partial_lint_plus_pre_ship_review`.

#### Example 1: Codegen Volatile Local

severity: `warning`; rule: `volatile_local_tactic`.

Bad:

```c
volatile s32 temp;

temp = value;
UseTemp(temp);
```

Preferred:

```c
s32 temp;

temp = value;
UseTemp(temp);
/* Keep volatile only for real hardware or SDK semantics. */
```

Why this example represents the standard:

- Local volatile declarations in normal source are usually lifetime/register steering tactics that need evidence.

#### Example 2: Matching Tactic Dummy Array

severity: `warning`.

Bad:

```c
s32 dummy[8];

score = CalcScore(player);
return score;
```

Preferred:

```c
score = CalcScore(player);
return score;
/* Keep stack-shaping locals only with narrow objdiff evidence and cleanup notes. */
```

Why this example represents the standard:

- Dummy locals and arrays are stack-shape tactics, not normal source style.
- Partial or exploratory matches should not promote dummy stack tactics without evidence.

#### Example 3: Matching Pad Stack Sp Pad

severity: `warning`.

Bad:

```c
s32 sp[4];
UNUSED u8 sp_pad[8];
s32 i;

UseStack(sp);
```

Preferred:

```c
s32 sp[4];
s32 i;

PAD_STACK(8);

UseStack(sp);
/* Keep stack padding narrow and backed by objdiff evidence. */
```

Why this example represents the standard:

- Manual UNUSED padding arrays are dummy locals posing as source structure.
- When intentional padding is required, use PAD_STACK(N) and keep the tactic evidence-bound.

#### Example 4: Sdata2 Order Helper

severity: `workflow_context`.

Bad:

```c
void mnDiagram_80241310(s32 arg0, s32 arg1, s32 arg2)
{
    /// @todo Constant-pool anchors: these dead literals emit no code but
    ///       reserve .sdata2 slots for mnDiagram_804DBF94 (-1.0f) and
    ///       mnDiagram_804DBF98 (the s32-to-f32 bias).
    (void) -1.0F;
    (void) 4503601774854144.0;
    ...
}
```

Preferred:

```c
/// @todo .sdata2 order hack
static void order_sdata2(void)
{
    (void) -1.0f;
    (void) S32_TO_F32;
}
/* Keep unavoidable .sdata2 ordering helpers isolated and use named literals/macros instead of magic constants. */
```

Why this example represents the standard:

- When a narrow .sdata2 ordering helper is accepted for a match, keep the tactic isolated from ordinary function logic and mark it as cleanup debt.
- Use the project macro for the s32-to-f32 bias instead of spelling the raw double literal.

### Avoid new pragmas, register steering, and inline assembly for normal source

Standard id: `global_standard:avoid-pragmas-register-asm`

- Pragmas, register keywords, and inline assembly are exceptions, not ordinary decomp style.
- Scope unavoidable exceptions tightly and prove they do not harm neighbors.

QA coverage: `register_keyword`, `inline_asm`, `novel_pragma`, `codegen_pragma`.
Severity: `repair_required`; enforcement: `hard_lint_plus_warning`.

#### Example 1: Codegen Known Pragma

severity: `warning`; rule: `codegen_pragma`.

Bad:

```c
#pragma push
#pragma global_optimizer off
void fn(void)
{
    ...
}
#pragma pop
```

Preferred:

```c
void fn(void)
{
    ...
}
/* Keep a pragma only as a narrow, evidenced exception with adjacent validation. */
```

Why this example represents the standard:

- Known MWCC pragmas exist in the project but are still suspicious when newly added as score-motivated codegen steering.

#### Example 2: Avoid Register Keyword

severity: `error`; rule: `register_keyword`.

Bad:

```c
register HSD_GObj* gobj = fighter;
register Fighter* fp = GET_FIGHTER(gobj);
return fp->x221F_b4;
```

Preferred:

```c
HSD_GObj* gobj = fighter;
Fighter* fp = GET_FIGHTER(gobj);
return fp->x221F_b4;
/* Do not add register steering as ordinary matching style. */
```

Why this example represents the standard:

- The register keyword is a codegen-steering tactic and should not be introduced as routine source cleanup.
- Reviewable source should remove register and similar tactic keywords unless a narrow exception is proven.

#### Example 3: Avoid Inline Asm Thpinit

severity: `error`; rule: `inline_asm`.

Bad:

```c
asm BOOL THPInit(void)
{
    nofralloc
    mflr r0
    ...
}
```

Preferred:

```c
BOOL THPInit(void)
{
    /* Recover the C body and keep raw asm out of normal source. */
    ...
}
```

Why this example represents the standard:

- Raw inline assembly is not acceptable normal decomp source when a C implementation can be recovered.
- Recover the C implementation instead of retaining an asm body for normal source.

#### Example 4: Avoid Inline Asm Fallback Ifstatus

severity: `error`; rule: `inline_asm`.

Bad:

```c
#ifdef MWERKS_GEKKO
asm void ifStatus_802F7134(void)
{
    nofralloc
    ...
}
#else
void ifStatus_802F7134(void)
{
    ...
}
#endif
```

Preferred:

```c
void ifStatus_802F7134(void)
{
    ...
}
/* Keep the recovered C body; do not wrap normal source in a raw asm fallback. */
```

Why this example represents the standard:

- A platform-gated asm body beside a readable C implementation is still raw inline assembly in normal decomp source.
- A match improvement does not justify keeping asm fallbacks beside recoverable C source.

#### Example 5: Codegen Pragma Todo Exception

severity: `warning`; rule: `codegen_pragma`.

Bad:

```c
/// @note Required for un_80300B58 to remain an exact match.
#pragma push
#pragma global_optimizer off
bool un_80300B58(int arg0)
{
    ...
}
#pragma pop
```

Preferred:

```c
/// @todo Find a solution without the pragma
#pragma push
#pragma global_optimizer off
bool un_80300B58(int arg0)
{
    ...
}
#pragma pop
```

Why this example represents the standard:

- When a reviewer accepts a narrow pragma temporarily, describe it as cleanup debt rather than a permanent source fact.
- A pragma exception should stay tightly scoped while preserving pressure to find the clean C form.

## Names, Defines, Headers, And Prototypes

Improve names, declarations, and headers only when source evidence supports them. Do not hide guesses behind aliases or local externs.

### Use semantic names only when the role is evidenced

Standard id: `global_standard:conservative-naming`

- Names should improve reviewability without inventing meaning.
- Use semantic names when supported, keep fn_/lbl_/address-style names when semantics are not proven, and clean temp_rXX names once a local role is clear.

QA coverage: `m2c_residue_names`.
Severity: `review_required`; enforcement: `partial_lint_plus_pre_ship_review`.

#### Example 1: Naming M2c Residue Local

severity: `error`; rule: `m2c_residue_names`.

Bad:

```c
s32 temp_r30 = var_r4 + phi_f1;

return temp_r30;
```

Preferred:

```c
s32 count = value + delta;

return count;
/* Use fp, ip, gp, gobj, or jobj when those roles are evidenced. */
```

Why this example represents the standard:

- Generated register names are decompiler residue.
- Source should either use evidenced role names or preserve address-style globals when semantics are unknown.

#### Example 2: Conservative Address Function Name

severity: `pre_ship_review`.

Bad:

```c
s32 mnName_GetUnlockedColumnCount(void)
{
    return mnName_802388D4();
}
/* Semantic name is guessed from behavior only. */
```

Preferred:

```c
s32 mnName_802388D4(void)
{
    return count;
}
/* Keep the address-style name until source or review evidence proves the role. */
```

Why this example represents the standard:

- Do not invent semantic names just because a function body became easier to understand.
- Preserve address-style names when stronger naming evidence is not present.

### Do not alias global renames with defines

Standard id: `global_standard:no-define-alias-global-renames`

- A global, extern, or data symbol should have one canonical name backed by source, symbol, map, or review evidence.
- Do not hide speculative or convenience renames behind identifier-to-identifier defines, and do not keep duplicate address-commented extern declarations for the same data address.

QA coverage: `define_alias`.
Severity: `repair_required`; enforcement: `hard_lint_plus_warning`.

#### Example 1: Naming Define Alias

severity: `error`; rule: `define_alias`.

Bad:

```c
#define camera_state lbl_804D1234

camera_state.x0 = value;
```

Preferred:

```c
lbl_804D1234.x0 = value;
/* Rename directly only after evidence supports a semantic name. */
```

Why this example represents the standard:

- Define aliases hide guessed names and make one data/global symbol appear to have multiple accepted names.

#### Example 2: Define Alias Central Symbol Rename

severity: `error`; rule: `define_alias`.

Bad:

```c
#define HSD_AudioGetAuxHeapSize AXDriver_8038E034

size = HSD_AudioGetAuxHeapSize();
```

Preferred:

```c
/* config/GALE01/symbols.txt */
/* Rename .text:0x8038E034 from AXDriver_8038E034 to HSD_AudioGetAuxHeapSize. */
size = HSD_AudioGetAuxHeapSize();
```

Why this example represents the standard:

- A canonical rename belongs in the central symbol metadata or direct references, not in a source alias.
- Perform the evidenced rename once in symbol metadata instead of masking duplicate names with a define.

### Keep headers, prototypes, and includes truthful

Standard id: `global_standard:truthful-headers-and-includes`

- When a body proves a signature, update the owning header and remove UNK_RET/UNK_PARAMS.
- Use established include style and run require-protos checks when prototype or include surfaces change.

QA coverage: `function_extern_visibility`, `same_tu_function_extern`.
Severity: `review_required`; enforcement: `partial_lint_plus_pre_ship_review`.

#### Example 1: Headers Source Local Extern

severity: `error`; rule: `same_tu_function_extern`.

Bad:

```c
extern void Helper(void);

void Caller(void)
{
    Helper();
}

void Helper(void)
{
    ...
}
```

Preferred:

```c
void Helper(void);

void Caller(void)
{
    Helper();
}

void Helper(void)
{
    ...
}
/* Move real public prototypes to the owning header instead. */
```

Why this example represents the standard:

- A same-TU extern can hide the function body from MWCC and steer inlining.
- Header/prototype truth should improve as source is recovered.

#### Example 2: Truthful Header Prototype

severity: `pre_ship_review`.

Bad:

```c
/* mnname.h */
UNK_RET mnName_802388D4(UNK_PARAMS);

/* mnname.c */
s32 mnName_802388D4(s32 slot) { return slot + 1; }
```

Preferred:

```c
/* mnname.h */
s32 mnName_802388D4(s32 slot);

/* mnname.c */
s32 mnName_802388D4(s32 slot) { return slot + 1; }
```

Why this example represents the standard:

- When the body proves a signature, the owning header should stop advertising UNK_RET and UNK_PARAMS.
- The standard is checking that source recovery improves the public declaration surface too.

#### Example 3: Truthful Pointer Return Storage Boundary

severity: `pre_ship_review`.

Bad:

```c
int grHomeRun_8021EC58(int arg);

gp->gv.unk.xCC = grHomeRun_8021EC58(0);
text = (HSD_Text*) gp->gv.unk.xCC;
```

Preferred:

```c
HSD_Text* grHomeRun_8021EC58(int arg);

gp->gv.unk.xCC = (intptr_t) grHomeRun_8021EC58(0);
text = (HSD_Text*) (intptr_t) gp->gv.unk.xCC;
/* Keep the pointer type on the producer; use intptr_t only at the generic storage boundary. */
```

Why this example represents the standard:

- When a recovered function body proves that a value is an HSD_Text pointer, the prototype should expose that pointer type.
- Generic GroundVars storage may still require an integer-sized bridge, but the bridge should be local to storing/loading the generic slot rather than becoming the semantic type of the function.

#### Example 4: Headers Include Proto Shim

severity: `pre_ship_review`.

Bad:

```c
#define __THPReadFrameHeader __THPReadFrameHeader_proto
#define THPDec_80330158 THPDec_80330158_proto
#include <dolphin/thp/thp.h>
#undef THPDec_80330158
#undef __THPReadFrameHeader

static u8 __THPReadFrameHeader(THPFileInfo* info);
```

Preferred:

```c
#include <dolphin/thp/thp.h>

/* dolphin/thp/thp.h owns the recovered signatures. */
static u8 __THPReadFrameHeader(THPFileInfo*);
u8 THPDec_80330158(THPFileInfo* info);
```

Why this example represents the standard:

- Macro-renaming declarations around an include hides a prototype conflict instead of fixing the owning header.
- Repair the owning header signature and include it normally instead of using macro/prototype shims around the include.

## Merged And Workflow-Only Standards

These records stay searchable for provenance, but they are not standalone worker-facing source standards. Their examples remain useful when a reviewer or repair flow explicitly asks for that history.

### Match text before chasing data sections

Standard id: `global_standard:text-before-data-matching`

Status: `merged`; disposition: `merged`; retired into: `global_standard:literals-and-data-ownership`.
- For matching PRs, text-section function progress is the primary objective.
- Data, literal, symbol, and split edits are high-risk secondary work: keep them only when required for the claimed code match, backed by section ownership or symbol metadata, or explicitly scoped as data cleanup.

#### Reference example 1: Text Before Data Sdata2 Helper

Bad:

```c
static void sdata2_order(void)
{
    (void) 0.0F;
    (void) 1.0F;
}
```

Preferred:

```c
speed = 1.0F;
angle = 0.0F;
/* Use metadata fixes or explicit data scope for real ownership work. */
```

Why:

- A helper that exists only to force literal order is data-matching work, not normal source cleanup.
- Keep this kind of tactic narrow and evidence-bound instead of blending it into implementation style.

#### Reference example 2: Text Before Data Table Regression

Bad:

```c
static u8 table_blob[] = {
    0x10, 0x20, 0x30, 0x40,
};
/* Large table reshaping is mixed into a focused code match. */
```

Preferred:

```c
/* Land the verified text match first. */
/* Keep table reshaping in a data-scoped change with section evidence. */
```

Why:

- Large table and storage reshaping can create data regressions even when nearby C looks cleaner.
- The standard is checking whether data parity work is justified by the code-match scope.

### Respect data sections and translation-unit split evidence

Standard id: `global_standard:data-sections-and-tu-splits`

Status: `merged`; disposition: `merged`; retired into: `global_standard:literals-and-data-ownership`.
- Section placement, symbol size/scope, local labels, assert filenames, string clusters, object names, and float groups are part of matching.
- Fix metadata instead of compensating with fake C storage.

#### Reference example 1: Data Section Symbol Metadata

Bad:

```c
static u8 gmopening_804D6A10;
static u8 gmopening_804D6A11;
/* C storage is added to compensate for symbol layout. */
```

Preferred:

```c
/* config/GALE01/symbols.txt */
/* Correct the .sbss symbol scope and local labels at the owning addresses. */
/* Then keep the C source focused on the recovered behavior. */
```

Why:

- Section ownership problems should usually be fixed in symbol or split metadata, not by inventing C storage.
- Linkage or section issues belong in metadata; adding C storage hides the real ownership problem.

#### Reference example 2: Data Section Split Boundary

Bad:

```c
/* Move copied Purin code into a new file only. */
#include "ftkirbyspecialpurin.h"
/* splits.txt and symbols.txt are left unchanged. */
```

Preferred:

```c
/* Add the new TU source and header. */
/* Update configure.py, splits.txt, and symbols.txt for text/data/sdata/sdata2 ownership. */
/* Remove the old copied block from the donor TU. */
```

Why:

- A real TU split needs source, build, split, and symbol ownership to move together.
- Adjacent boundaries and local labels are part of the source cleanup, so splitting only the C file is incomplete.

### Claim matches only with build, objdiff, and regression evidence

Standard id: `global_standard:verification-and-regression-ledger`

Status: `workflow_only`; disposition: `workflow_only`; retired into: `runner_validation_and_workflow_runbooks`.
- Every claimed matched symbol, score candidate, or source cleanup must name the narrow build/objdiff/checkdiff evidence and any adjacent regression checks needed for the edit's blast radius.

#### Reference example 1: Verification Contradictory Claim

Bad:

```c
/* Verification note */
All touched functions are 100 percent in objdiff.
Bot report: mnName_GetColumnCount is 98.72 percent.
```

Preferred:

```c
/* Verification note */
Verified exact: fn_8018846C, mnName_802388D4.
Not exact: mnName_GetColumnCount at 98.72 percent.
Next action: keep as improvement or repair before shipping.
```

Why:

- Contradictory verification evidence should be preserved instead of collapsed into a match claim.
- This workflow-only standard is checking the truthfulness of evidence, not C syntax.

#### Reference example 2: Verification Assert Conversion Todo

Bad:

```c
HSD_ASSERT(0x88, ptr);
/* This conversion changes object bytes, but it is kept anyway. */
```

Preferred:

```c
if (ptr == NULL) {
    __assert(__FILE__, 0x88, "ptr");
}
/* @todo: Find the byte-matching assert macro form before converting. */
```

Why:

- A cleanup that changes object bytes should not be accepted just because the target style is desirable.
- Keep non-byte-matching assert conversions expanded with a specific TODO until the byte-matching macro form is found.

## Prompt And Repair Routing

| Use case | Source |
| --- | --- |
| Worker base prompt | Active standards from `standards.jsonl`, each with one canonical example pair from `examples.jsonl`. |
| Deterministic lint finding | `review_lint` message, `standard_id`, `rule_id`, and targeted repair hint. |
| QA repair and fixer | Standard-linked examples selected by `standard_id` and `qa_rule_id`. |
| Pre-ship review | `preship_exhibits.json`, banned-pattern exhibits, and standard-linked examples. |
| Repeated rejected hunk | `banned_patterns/data/tombstones.jsonl` with the original rejection URL. |
