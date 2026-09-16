# TGamewatch Target-Stage Callbacks

Exports Gr_Kind_TGamewatch and /GrTGw.dat with three populated callback rows and a fourth all-null row. Rows0/1 carry zero flags, row2 carries 0xC0000000. Initialization delegates to Ground_InitTargetStage with the local ID-indexed callback installer; start calls grZakoGenerator_801CAE04(NULL). Local predicates are false, dynamics lookup returns NULL and vector/JObj policy returns true.

Row numbering follows table order, not function address order. Row 2 runs lb_800115F4 before Ground_801C2FE0; row 1 calls only the Ground helper. Four rows exist but only three have callbacks; no local installer bounds or null-row rejection is present.

## Function coverage

| Symbol | Evidence | Behavior |
|---|---|---|
| grTGameWatch_80224110 | [37–40](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L37-L40) | Ignores the bool argument and returns without calls or state changes; registered descriptor hook. |
| grTGameWatch_80224114 | [42–45](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L42-L45) | Passes grTGameWatch_802241B4 to Ground_InitTargetStage once. Actual object creation order and target setup are determined by the foreign inline/helper, not this wrapper. |
| grTgamewatch_UnkStage0_OnLoad | [47–50](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L47-L50) | Parameterless descriptor hook that immediately returns without calls or state changes. |
| grTgamewatch_UnkStage0_OnStart | [52–55](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L52-L55) | Calls grZakoGenerator_801CAE04(NULL) once, ignores its return and returns normally. No local allocation, spawning, guard or recovery logic. |
| grTGameWatch_802241AC | [57–60](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L57-L60) | Parameterless descriptor predicate always returns false without side effects. |
| grTGameWatch_802241B4 | [62–76](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L62-L76) | Forms a pointer to grTGw_StageCallbacks[id] without bounds validation, retrieves the Ground GObj for the same ID and applies the row only if nonnull; otherwise reports the missing ID. Returns the lookup result. Four rows are present, including a final all-null row; this function does not reject that row. |
| grTGameWatch_8022429C | [78–82](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L78-L82) | Row0 first callback obtains user data as Ground, reads map_id and calls grAnime_801C8138(gobj,map_id,0). No null guards or local animation implementation. |
| grTGameWatch_802242C8 | [84–87](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L84-L87) | Row0 second callback ignores its object and returns false without side effects. |
| grTGameWatch_802242D0 | [89–92](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L89-L92) | Row0 third callback ignores its object and returns without calls or mutations. |
| grTGameWatch_802242D4 | [94–97](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L94-L97) | Row0 fourth callback ignores its object and returns without calls or mutations. |
| grTGameWatch_802242D8 | [99–102](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L99-L102) | Row2 first callback delegates once to Ground_JObjInline1(gobj); foreign inline semantics remain unverified here. |
| grTGameWatch_80224328 | [104–107](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L104-L107) | Row2 second callback ignores its object and returns false without side effects. |
| grTGameWatch_80224330 | [109–113](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L109-L113) | Row2 third callback calls lb_800115F4 first, then Ground_801C2FE0(gobj). No local branches, state accesses or return handling. This order differs from Figure3 row1. |
| grTGameWatch_80224364 | [115–118](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L115-L118) | Row2 fourth callback ignores its object and returns without calls or mutations. |
| grTGameWatch_80224368 | [120–123](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L120-L123) | Row1 first callback delegates once to Ground_JObjInline1(gobj); foreign inline semantics remain unverified here. |
| grTGameWatch_802243B8 | [125–128](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L125-L128) | Row1 second callback ignores its object and returns false without side effects. |
| grTGameWatch_802243C0 | [130–133](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L130-L133) | Row1 third callback forwards gobj once to Ground_801C2FE0 without local guards or result handling. |
| grTGameWatch_802243E0 | [135–138](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L135-L138) | Row1 fourth callback ignores its object and returns without calls or mutations. |
| grTGameWatch_802243E4 | [140–143](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L140-L143) | Ignores enum_t input and returns NULL as DynamicsDesc* without calls or state accesses. |
| grTGameWatch_802243EC | [145–148](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtgamewatch.c#L145-L148) | Ignores Vec3 pointer, integer and JObj pointer and returns true without side effects. |

## Coverage and names

All 182 owned lines were read canonically and rendered through EOF. All 21 targets, 19 entities, inherited facts and 29 links are covered. Nine generic stageGObj aliases collide with existing baseline and canonical symbols and remain unresolved with exact values preserved. Detailed course layout and foreign helper behavior are deferred. No source or shared knowledge changes.
