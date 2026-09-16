# Figure3 Stage Callbacks

Exports Gr_Kind_Figure3 with /GrEF3.dat, a three-row callback table, initialization/start hooks and constant policy callbacks. Initialization installs objects in order 0,2,1; row1 carries flags 0xC0000000 while rows0/2 carry zero. The canonical table name grEF2_StageCallbacks is used by the Figure3 descriptor. Private yakumono_param is assigned during initialization and never read elsewhere in this TU.

The three objects are looked up in order 0, 2, 1; missing objects are reported without aborting the remaining initialization. Most callbacks are empty or constant predicates. The final vector/JObj policy always returns true, but that result alone does not force a shadow draw through other camera/stage gates.

## Function coverage

| Symbol | Evidence | Behavior |
|---|---|---|
| grFigure3_8020E504 | [63–63](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L63-L63) | Empty bool-argument stage descriptor hook; ignores the argument and performs no calls or state operations. |
| grFigure3_8020E508 | [65–75](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L65-L75) | Stores Ground_GetYakumonoParam result in the private pointer, clears stage_info.unk8C.b4 and sets b5, requests objects in order 0,2,1, then calls Ground_801C39C0 and Ground_801C3BB4. Ignores each lookup result and continues after failure. |
| grFigure3_OnLoad | [77–77](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L77-L77) | Empty parameterless descriptor hook, with no calls, mutations or output. |
| grFigure3_OnStart | [79–82](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L79-L82) | Calls grZakoGenerator_801CAE04(NULL) once and ignores its return. No local guard, allocation, spawn loop or failure recovery exists; returns normally after the callee. |
| grFigure3_8020E5A0 | [84–87](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L84-L87) | Parameterless stage descriptor predicate returning false without reading or mutating state. |
| grFigure3_8020E5A8 | [89–103](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L89-L103) | Indexes the three-row callback table using unchecked signed gobj_id, retrieves that Ground GObj, applies the selected callbacks only when nonnull, otherwise reports the missing ID, and returns the lookup result. Local initializer supplies only 0,2,1. |
| grFigure3_8020E690 | [105–109](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L105-L109) | Row0 first callback reads Ground map_id through user_data and calls grAnime_801C8138(gobj,map_id,0) without local null checks or other writes. |
| grFigure3_8020E6BC | [111–114](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L111-L114) | Row0 second callback ignores its Ground GObj and always returns false without side effects. |
| grFigure3_8020E6C4 | [116–116](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L116-L116) | Row0 third callback is empty; ignores its object and performs no processing. |
| grFigure3_8020E6C8 | [118–118](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L118-L118) | Row0 fourth callback is empty; ignores its object and performs no processing. |
| grFigure3_8020E6CC | [120–124](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L120-L124) | Row1 first callback reads Ground map_id and forwards gobj->hsd_obj and map_id to Ground_801C2ED0. No local guard or return handling exists. |
| grFigure3_8020E6F8 | [126–129](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L126-L129) | Row1 second callback ignores its Ground GObj and always returns false without side effects. |
| grFigure3_8020E700 | [131–135](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L131-L135) | Row1 third callback forwards gobj to Ground_801C2FE0 then calls lb_800115F4, in that order. No local field reads, branches, timers or result handling. |
| grFigure3_8020E724 | [137–137](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L137-L137) | Row1 fourth callback is empty and ignores its object. |
| grFigure3_8020E728 | [139–142](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L139-L142) | Row2 first callback delegates once to Ground_JObjInline1(gobj). The included foreign inline determines actual joint mutations; this wrapper has no other local logic. |
| grFigure3_8020E778 | [144–147](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L144-L147) | Row2 second callback ignores its Ground GObj and always returns false without side effects. |
| grFigure3_8020E780 | [149–149](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L149-L149) | Row2 third callback is empty and ignores its object. |
| grFigure3_8020E784 | [151–151](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L151-L151) | Row2 fourth callback is empty and ignores its object. |
| grFigure3_8020E788 | [153–156](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L153-L156) | DynamicsDesc-returning descriptor hook ignores enum_t input and always returns NULL without accesses or calls. |
| grFigure3_8020E790 | [158–161](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grfigure3.c#L158-L161) | Vector/integer/JObj descriptor predicate ignores all three inputs and always returns true without state changes or calls. |

## Coverage and links

All 171 owned lines were read in canonical and rendered views. Findings account for every target, source/parameter entity and inherited fact. All 13 outgoing links were reviewed: one local stage-component relationship retained, twelve event-identity relationships unresolved pending external verification. Exact baseline records and canonical evidence are in link-dispositions.json. No source or shared knowledge changes.
