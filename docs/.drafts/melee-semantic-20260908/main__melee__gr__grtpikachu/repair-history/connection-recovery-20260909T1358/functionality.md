# grtpikachu Functionality

TPikachu registers /GrTPk.dat and three active callback records plus a zero fourth row. Common target-stage initialization requests objects0,1,2 and continues after failures. Unlike Figure2, object2 advances shared effects before its Ground update; object1 only runs the Ground update.

## Entry Points

| Canonical | Behavior |
|---|---|
| grTPikachu_80222E7C | Demo hook ignores bool and returns; shared StageData slot declares int argument, so no ABI correction inferred. |
| grTPikachu_80222E80 | Calls Ground_InitTargetStage with grTPikachu_80222F20. Shared inline sets stage bits4/5 to0/1, requests IDs0,1,2 and calls four Ground routines, ignoring returned objects. |
| grTpikachu_UnkStage0_OnLoad | Load hook returns without calls or state changes. |
| grTpikachu_UnkStage0_OnStart | Calls grZakoGenerator_801CAE04(NULL) once and ignores result; no local guard/retry. Void return is not noreturn. |
| grTPikachu_80222F18 | StageData callback4 returns false, without calls or state reads. |
| grTPikachu_80222F20 | Indexes four-row callback table with unchecked signed ID, retrieves same ID with Ground_GetStageGObj, invokes setup only if nonnull else reports failure, and returns lookup result. Shared setup ignores callback1/flags; row3 is zero but does not itself bound IDs. |
| grTPikachu_80223008 | Object0 init gets Ground user data and calls grAnime_801C8138(gobj,map_id,0). No pointer guard or local success result. |
| grTPikachu_80223034 | Object0 callback1 returns false; argument unused. |
| grTPikachu_8022303C | Object0 process hook returns without work. |
| grTPikachu_80223040 | Object0 callback3 returns without work. |
| grTPikachu_80223044 | Object2 init invokes Ground_JObjInline1: shared inline forwards JObj/map_id to Ground_801C2ED0 then gobj/map_id/0 to grAnime_801C8138. |
| grTPikachu_80223094 | Object2 callback1 returns false; argument unused. |
| grTPikachu_8022309C | Object2 process calls lb_800115F4 first, then Ground_801C2FE0(gobj). No local condition; order differs from Figure2 process callback. |
| grTPikachu_802230D0 | Object2 callback3 returns without work. |
| grTPikachu_802230D4 | Object1 init invokes Ground_JObjInline1: shared inline calls Ground_801C2ED0 then grAnime_801C8138 using map_id and animation index0. |
| grTPikachu_80223124 | Object1 callback1 returns false; argument unused. |
| grTPikachu_8022312C | Object1 process forwards gobj to Ground_801C2FE0; no local additional work. |
| grTPikachu_8022314C | Object1 callback3 returns without work. |
| grTPikachu_80223150 | StageData on_touch_line callback ignores enum_t and returnsNULL DynamicsDesc; no index lookup. |
| grTPikachu_80223158 | StageData shadow-eligibility callback ignores all three arguments and returns true; performs no rendering. |

## Limits

Shared setup installs callback3, calls on_init and schedules gobj_proc; it does not use callback1 or record flags. A zero fourth row does not validate arbitrary IDs. The null generator call does not prove targets were spawned. Canonical bool demo argument differs from the shared int slot. Touch-line returns no descriptor and shadow eligibility draws nothing.

Both owned files and183 displayed lines are reviewed in canonical/rendered views. All facts, empty entities, section target and exact outgoing links are recorded with versions. Zero parse errors; pointer-return header aliases are shadowed. Shared types/inlines are context only.
