# TKirby Target-Stage Callbacks

Exports Gr_Kind_TKirby and /GrTKb.dat with three populated callback rows and a fourth all-null row. Rows0/1 carry zero flags, row2 carries 0xC0000000. Initialization delegates to Ground_InitTargetStage with the local ID-indexed callback installer; start calls grZakoGenerator_801CAE04(NULL). Local predicates are false, dynamics lookup returns NULL and vector/JObj policy returns true.

Row numbering follows table order, not function address order. Row 2 runs lb_800115F4 before Ground_801C2FE0; row 1 calls only the Ground helper. Four rows exist but only three have callbacks; no local installer bounds or null-row rejection is present.

## Function coverage

| Symbol | Evidence | Behavior |
|---|---|---|
| grTKirby_80221364 | [78–78](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L78-L78) | Ignores the bool argument and returns without calls or state changes; registered descriptor hook. |
| grTKirby_80221368 | [80–83](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L80-L83) | Passes grTKirby_80221408 to Ground_InitTargetStage. The shared inline clears stage_info.unk8C.b4, sets b5, calls the installer for IDs0,1,2 in order, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC. Installer return values are ignored. |
| grTkirby_UnkStage0_OnLoad | [85–85](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L85-L85) | Parameterless descriptor hook that immediately returns without calls or state changes. |
| grTkirby_UnkStage0_OnStart | [87–90](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L87-L90) | Calls grZakoGenerator_801CAE04(NULL) once, ignores its return and returns normally. No local allocation, spawning, guard or recovery logic. |
| grTKirby_80221400 | [92–95](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L92-L95) | Parameterless descriptor predicate always returns false without side effects. |
| grTKirby_80221408 | [97–111](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L97-L111) | Forms a pointer to grTKb_StageCallbacks[id] without bounds validation, retrieves the Ground GObj for the same ID and applies the row only if nonnull; otherwise reports the missing ID. Returns the lookup result. Four rows are present, including a final all-null row; this function does not reject that row. |
| grTKirby_802214F0 | [113–117](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L113-L117) | Row0 first callback obtains user data as Ground, reads map_id and calls grAnime_801C8138(gobj,map_id,0). No null guards or local animation implementation. |
| grTKirby_8022151C | [119–122](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L119-L122) | Row0 second callback ignores its object and returns false without side effects. |
| grTKirby_80221524 | [124–124](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L124-L124) | Row0 third callback ignores its object and returns without calls or mutations. |
| grTKirby_80221528 | [126–126](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L126-L126) | Row0 fourth callback ignores its object and returns without calls or mutations. |
| grTKirby_8022152C | [128–131](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L128-L131) | Row2 first callback delegates once to Ground_JObjInline1(gobj); the shared inline reads Ground map_id and JObj, calls Ground_801C2ED0(jobj,map_id), then grAnime_801C8138(gobj,map_id,0). Callee internals remain unverified. |
| grTKirby_8022157C | [133–136](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L133-L136) | Row2 second callback ignores its object and returns false without side effects. |
| grTKirby_80221584 | [138–142](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L138-L142) | Row2 third callback calls lb_800115F4 first, then Ground_801C2FE0(gobj). No local branches, state accesses or return handling. |
| grTKirby_802215B8 | [144–144](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L144-L144) | Row2 fourth callback ignores its object and returns without calls or mutations. |
| grTKirby_802215BC | [146–149](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L146-L149) | Row1 first callback delegates once to Ground_JObjInline1(gobj); the shared inline reads Ground map_id and JObj, calls Ground_801C2ED0(jobj,map_id), then grAnime_801C8138(gobj,map_id,0). Callee internals remain unverified. |
| grTKirby_8022160C | [151–154](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L151-L154) | Row1 second callback ignores its object and returns false without side effects. |
| grTKirby_80221614 | [156–159](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L156-L159) | Row1 third callback forwards gobj once to Ground_801C2FE0 without local guards or result handling. |
| grTKirby_80221634 | [161–161](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L161-L161) | Row1 fourth callback ignores its object and returns without calls or mutations. |
| grTKirby_80221638 | [163–166](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L163-L166) | Ignores enum_t input and returns NULL as DynamicsDesc* without calls or state accesses. |
| grTKirby_80221640 | [168–171](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L168-L171) | Ignores Vec3 pointer, integer and JObj pointer and returns true without side effects. |

## Coverage and names

All 188 owned lines were read canonically and rendered through EOF. All 21 targets, 19 entities, inherited facts and 29 links are covered. Twelve generic aliases collide with existing baseline and canonical symbols and remain unresolved with exact values preserved. Detailed course layout and foreign helper behavior are deferred. No source or shared knowledge changes.

## Shared helper evidence

[Ground inlines](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L62) establish setup order 0, 1, 2, the conditional callback3/on_init/gobj_proc operations, and the two calls in Ground_JObjInline1. Callback1 is never consumed by this setup inline. The fourth null row is not traversed as a sentinel.

[Callback types](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L131-L171) establish field order; [query typedefs](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L194-L196) establish signatures. Exact runtime query consumers remain unverified. All 20 function declarations have external linkage; static appears only in comments.
