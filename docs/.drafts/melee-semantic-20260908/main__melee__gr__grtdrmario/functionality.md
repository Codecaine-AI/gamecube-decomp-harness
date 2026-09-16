# TDrmario Target-Stage Callbacks

Exports Gr_Kind_TDrmario and /GrTDr.dat with three populated callback rows and a fourth all-null row. Rows0/1 carry zero flags, row2 carries 0xC0000000. Initialization delegates to Ground_InitTargetStage with the local ID-indexed callback installer; start calls grZakoGenerator_801CAE04(NULL). Local predicates are false, dynamics lookup returns NULL and vector/JObj policy returns true.

Row numbering follows table order, not function address order. Row 2 runs lb_800115F4 before Ground_801C2FE0; row 1 calls only the Ground helper. Four rows exist but only three have callbacks; no local installer bounds or null-row rejection is present.

## Function coverage

| Symbol | Evidence | Behavior |
|---|---|---|
| grtDrMario_8022050C | [77–77](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L77-L77) | Ignores the bool argument and returns without calls or state changes; registered descriptor hook. |
| grtDrMario_80220510 | [79–82](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L79-L82) | Passes grtDrMario_802205B0 to Ground_InitTargetStage once. Actual object creation order and target setup are determined by the foreign inline/helper, not this wrapper. |
| grTdrmario_UnkStage0_OnLoad | [84–84](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L84-L84) | Parameterless descriptor hook that immediately returns without calls or state changes. |
| grTdrmario_UnkStage0_OnStart | [86–89](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L86-L89) | Calls grZakoGenerator_801CAE04(NULL) once, ignores its return and returns normally. No local allocation, spawning, guard or recovery logic. |
| grtDrMario_802205A8 | [91–94](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L91-L94) | Parameterless descriptor predicate always returns false without side effects. |
| grtDrMario_802205B0 | [96–110](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L96-L110) | Forms a pointer to grTDr_StageCallbacks[id] without bounds validation, retrieves the Ground GObj for the same ID and applies the row only if nonnull; otherwise reports the missing ID. Returns the lookup result. Four rows are present, including a final all-null row; this function does not reject that row. |
| grtDrMario_80220698 | [112–116](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L112-L116) | Row0 first callback obtains user data as Ground, reads map_id and calls grAnime_801C8138(gobj,map_id,0). No null guards or local animation implementation. |
| grtDrMario_802206C4 | [118–121](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L118-L121) | Row0 second callback ignores its object and returns false without side effects. |
| grtDrMario_802206CC | [123–123](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L123-L123) | Row0 third callback ignores its object and returns without calls or mutations. |
| grtDrMario_802206D0 | [125–125](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L125-L125) | Row0 fourth callback ignores its object and returns without calls or mutations. |
| grtDrMario_802206D4 | [127–130](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L127-L130) | Row2 first callback delegates once to Ground_JObjInline1(gobj); foreign inline semantics remain unverified here. |
| grtDrMario_80220724 | [132–135](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L132-L135) | Row2 second callback ignores its object and returns false without side effects. |
| grtDrMario_8022072C | [137–141](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L137-L141) | Row2 third callback calls lb_800115F4 first, then Ground_801C2FE0(gobj). No local branches, state accesses or return handling. This order differs from Figure3 row1. |
| grtDrMario_80220760 | [143–143](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L143-L143) | Row2 fourth callback ignores its object and returns without calls or mutations. |
| grtDrMario_80220764 | [145–148](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L145-L148) | Row1 first callback delegates once to Ground_JObjInline1(gobj); foreign inline semantics remain unverified here. |
| grtDrMario_802207B4 | [150–153](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L150-L153) | Row1 second callback ignores its object and returns false without side effects. |
| grtDrMario_802207BC | [155–158](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L155-L158) | Row1 third callback forwards gobj once to Ground_801C2FE0 without local guards or result handling. |
| grtDrMario_802207DC | [160–160](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L160-L160) | Row1 fourth callback ignores its object and returns without calls or mutations. |
| grtDrMario_802207E0 | [162–165](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L162-L165) | Ignores enum_t input and returns NULL as DynamicsDesc* without calls or state accesses. |
| grtDrMario_802207E8 | [167–170](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtdrmario.c#L167-L170) | Ignores Vec3 pointer, integer and JObj pointer and returns true without side effects. |

## Coverage and names

All 187 owned lines were read canonically and rendered through EOF. All 21 targets, 19 entities, inherited facts and 25 links are covered. Six generic aliases collide with existing baseline and canonical symbols and remain unresolved with exact values preserved. Detailed course layout and foreign helper behavior are deferred. No source or shared knowledge changes.
