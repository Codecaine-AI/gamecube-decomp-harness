# TSeak Target-Stage Callbacks

Exports Gr_Kind_TSeak and /GrTSk.dat with three populated callback rows and a fourth all-null row. Rows0/1 carry zero flags, row2 carries 0xC0000000. Initialization delegates to Ground_InitTargetStage with the local ID-indexed callback installer; start calls grZakoGenerator_801CAE04(NULL). Local predicates are false, dynamics lookup returns NULL and vector/JObj policy returns true.

Row numbering follows table order, not function address order. Row 2 runs lb_800115F4 before Ground_801C2FE0; row 1 calls only the Ground helper. Four rows exist but only three have callbacks; no local installer bounds or null-row rejection is present.

## Function coverage

| Symbol | Evidence | Behavior |
|---|---|---|
| grTSeak_OnDemoInit | [75–75](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L75-L75) | Ignores the bool argument and returns without calls or state changes; registered descriptor hook. |
| grTSeak_OnInit | [77–80](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L77-L80) | Passes grTSeak_80223908 to Ground_InitTargetStage. The shared inline clears stage_info.unk8C.b4, sets b5, calls the installer for IDs0,1,2 in order, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC. Installer return values are ignored. |
| grTseak_OnLoad | [82–82](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L82-L82) | Parameterless descriptor hook that immediately returns without calls or state changes. |
| grTseak_OnStart | [84–87](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L84-L87) | Calls grZakoGenerator_801CAE04(NULL) once, ignores its return and returns normally. No local allocation, spawning, guard or recovery logic. |
| grTSeak_80223900 | [89–92](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L89-L92) | Parameterless descriptor predicate always returns false without side effects. |
| grTSeak_80223908 | [94–108](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L94-L108) | Forms a pointer to grTSk_StageCallbacks[id] without bounds validation, retrieves the Ground GObj for the same ID and applies the row only if nonnull; otherwise reports the missing ID. Returns the lookup result. Four rows are present, including a final all-null row; this function does not reject that row. |
| grTSeak_802239F0 | [110–114](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L110-L114) | Row0 first callback obtains user data as Ground, reads map_id and calls grAnime_801C8138(gobj,map_id,0). No null guards or local animation implementation. |
| grTSeak_80223A1C | [116–119](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L116-L119) | Row0 second callback ignores its object and returns false without side effects. |
| grTSeak_80223A24 | [121–121](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L121-L121) | Row0 third callback ignores its object and returns without calls or mutations. |
| grTSeak_80223A28 | [123–123](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L123-L123) | Row0 fourth callback ignores its object and returns without calls or mutations. |
| grTSeak_80223A2C | [125–128](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L125-L128) | Row2 first callback delegates once to Ground_JObjInline1(gobj); the shared inline reads Ground map_id and JObj, calls Ground_801C2ED0(jobj,map_id), then grAnime_801C8138(gobj,map_id,0). Callee internals remain unverified. |
| grTSeak_80223A7C | [130–133](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L130-L133) | Row2 second callback ignores its object and returns false without side effects. |
| grTSeak_80223A84 | [135–139](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L135-L139) | Row2 third callback calls lb_800115F4 first, then Ground_801C2FE0(gobj). No local branches, state accesses or return handling. |
| grTSeak_80223AB8 | [141–141](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L141-L141) | Row2 fourth callback ignores its object and returns without calls or mutations. |
| grTSeak_80223ABC | [143–146](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L143-L146) | Row1 first callback delegates once to Ground_JObjInline1(gobj); the shared inline reads Ground map_id and JObj, calls Ground_801C2ED0(jobj,map_id), then grAnime_801C8138(gobj,map_id,0). Callee internals remain unverified. |
| grTSeak_80223B0C | [148–151](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L148-L151) | Row1 second callback ignores its object and returns false without side effects. |
| grTSeak_80223B14 | [153–156](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L153-L156) | Row1 third callback forwards gobj once to Ground_801C2FE0 without local guards or result handling. |
| grTSeak_80223B34 | [158–158](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L158-L158) | Row1 fourth callback ignores its object and returns without calls or mutations. |
| grTSeak_OnTouchLine | [160–163](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L160-L163) | Ignores enum_t input and returns NULL as DynamicsDesc* without calls or state accesses. |
| grTSeak_OnCheckShadowRender | [165–168](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L165-L168) | Ignores Vec3 pointer, integer and JObj pointer and returns true without side effects. |

## Coverage and names

All 178 owned lines were read canonically and rendered through EOF. All 21 targets, 19 entities, inherited facts and 27 links are covered. Seven generic aliases collide with existing baseline and canonical symbols and remain unresolved with exact values preserved. Detailed course layout and foreign helper behavior are deferred. No source or shared knowledge changes.

## Shared helper evidence

[Ground inlines](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L62) establish setup order 0, 1, 2 and conditional callback3/on_init/gobj_proc operations. Callback1 and callback flags are not consumed by this inline; the fourth null row is not traversed as a sentinel.

[Callback fields](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L131-L171) and [query typedefs](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L194-L196) establish layout and signatures. StageData joints/count are implicitly zero. All 20 functions have internal linkage inherited from their static forward declarations. The header exports grTSk_StageData.

Unused/debug-only course identity, terrain, target count and completion rules remain unresolved.
