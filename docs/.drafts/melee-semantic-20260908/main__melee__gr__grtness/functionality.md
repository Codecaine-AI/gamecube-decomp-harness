# TNess Target-Stage Callbacks

Exports Gr_Kind_TNess and /GrTNs.dat with three populated callback rows and a fourth all-null row. Rows 0/1 carry zero flags, row2 carries 0xC0000000. Initialization delegates to Ground_InitTargetStage with the local ID-indexed callback installer; start calls grZakoGenerator_801CAE04(NULL). Local predicates are false, dynamics lookup returns NULL and vector/JObj policy returns true.

Row numbering follows table order, not function address order. Row 2 runs lb_800115F4 before Ground_801C2FE0; row 1 calls only the Ground helper. Four rows exist but only three have callbacks; no local installer bounds or null-row rejection is present.

## Function coverage

| Symbol | Evidence | Behavior |
|---|---|---|
| grTNess_802225D0 | [73–76](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L73-L76) | Ignores the bool argument and returns without calls or state changes; registered descriptor hook. |
| grTNess_802225D4 | [78–81](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L78-L81) | Passes grTNess_80222674 to Ground_InitTargetStage. The shared inline clears stage_info.unk8C.b4, sets b5, calls the installer for IDs0,1,2 in order, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC. Installer return values are ignored. |
| grTness_UnkStage0_OnLoad | [83–86](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L83-L86) | Parameterless descriptor hook that immediately returns without calls or state changes. |
| grTness_UnkStage0_OnStart | [88–91](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L88-L91) | Calls grZakoGenerator_801CAE04(NULL) once, ignores its return and returns normally. No local allocation, spawning, guard or recovery logic. |
| grTNess_8022266C | [93–96](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L93-L96) | Parameterless descriptor predicate always returns false without side effects. |
| grTNess_80222674 | [98–112](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L98-L112) | Forms a pointer to grTNs_StageCallbacks[id] without bounds validation, retrieves the Ground GObj for the same ID and applies the row only if nonnull; otherwise reports the missing ID. Returns the lookup result. Four rows are present, including a final all-null row; this function does not reject that row. |
| grTNess_8022275C | [114–118](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L114-L118) | Row0 first callback obtains user data as Ground, reads map_id and calls grAnime_801C8138(gobj,map_id,0). No null guards or local animation implementation. |
| grTNess_80222788 | [120–123](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L120-L123) | Row0 second callback ignores its object and returns false without side effects. |
| grTNess_80222790 | [125–128](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L125-L128) | Row0 third callback ignores its object and returns without calls or mutations. |
| grTNess_80222794 | [130–133](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L130-L133) | Row0 fourth callback ignores its object and returns without calls or mutations. |
| grTNess_80222798 | [135–138](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L135-L138) | Row2 first callback delegates once to Ground_JObjInline1(gobj); the shared inline reads Ground map_id and JObj, calls Ground_801C2ED0(jobj,map_id), then grAnime_801C8138(gobj,map_id,0). Callee internals remain unverified. |
| grTNess_802227E8 | [140–143](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L140-L143) | Row2 second callback ignores its object and returns false without side effects. |
| grTNess_802227F0 | [145–149](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L145-L149) | Row2 third callback calls lb_800115F4 first, then Ground_801C2FE0(gobj). No local branches, state accesses or return handling. |
| grTNess_80222824 | [151–154](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L151-L154) | Row2 fourth callback ignores its object and returns without calls or mutations. |
| grTNess_80222828 | [156–159](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L156-L159) | Row1 first callback delegates once to Ground_JObjInline1(gobj); the shared inline reads Ground map_id and JObj, calls Ground_801C2ED0(jobj,map_id), then grAnime_801C8138(gobj,map_id,0). Callee internals remain unverified. |
| grTNess_80222878 | [161–164](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L161-L164) | Row1 second callback ignores its object and returns false without side effects. |
| grTNess_80222880 | [166–169](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L166-L169) | Row1 third callback forwards gobj once to Ground_801C2FE0 without local guards or result handling. |
| grTNess_802228A0 | [171–174](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L171-L174) | Row1 fourth callback ignores its object and returns without calls or mutations. |
| grTNess_802228A4 | [176–179](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L176-L179) | Ignores enum_t input and returns NULL as DynamicsDesc* without calls or state accesses. |
| grTNess_802228AC | [181–184](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtness.c#L181-L184) | Ignores Vec3 pointer, integer and JObj pointer and returns true without side effects. |

## Coverage and names

All 194 owned lines were read canonically and rendered through EOF. All 21 targets, 19 entities, inherited facts and 29 links are covered. Five generic aliases collide with existing baseline and canonical symbols and remain unresolved with exact values preserved. Detailed course layout and foreign helper behavior are deferred. No source or shared knowledge changes.

## Shared helper evidence

[Ground inlines](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L62) establish setup order 0, 1, 2, direct changes to stage_info bits, and conditional callback3/on_init/gobj_proc operations. Callback1 and callback flags are not consumed by this inline. The fourth null row is not traversed as a sentinel.

[Callback fields](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L131-L171) and [query typedefs](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L194-L196) establish layout and signatures. Rows 0/1 omit flags, so those fields are initialized to zero; the StageData joints pointer and count are also implicitly zero. All 20 functions are static; the header exports only grTNs_StageData.
