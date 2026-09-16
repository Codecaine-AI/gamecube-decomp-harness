# grtcaptain Functionality

TCaptain registers /GrTCa.dat and three active callback records plus a zero fourth row. Common target-stage initialization requests objects0,1,2 and continues after failures. Unlike Figure2, object2 advances shared effects before its Ground update; object1 only runs the Ground update.

## Entry Points

| Canonical | Behavior |
|---|---|
| grTCaptain_OnDemoInit | Demo hook ignores int and returns without work; signature agrees with shared StageData slot. |
| grTCaptain_OnInit | Calls Ground_InitTargetStage with grTCaptain_8021FD04. Shared inline sets stage bits4/5 to0/1, requests IDs0,1,2 and calls four Ground routines, ignoring returned objects. |
| grTCaptain_OnLoad | Load hook returns without calls or state changes. |
| grTCaptain_OnStart | Calls grZakoGenerator_801CAE04(NULL) once and ignores result; no local guard/retry. Void return is not noreturn. |
| grTCaptain_8021FCFC | StageData callback4 returns false, without calls or state reads. |
| grTCaptain_8021FD04 | Indexes four-row callback table with unchecked signed ID, retrieves same ID with Ground_GetStageGObj, invokes setup only if nonnull else reports failure, and returns lookup result. Shared setup ignores callback1/flags; row3 is zero but does not itself bound IDs. |
| grTCaptain_8021FDEC | Object0 init gets Ground user data and calls grAnime_801C8138(gobj,map_id,0). No pointer guard or local success result. |
| grTCaptain_8021FE18 | Object0 callback1 returns false; argument unused. |
| grTCaptain_8021FE20 | Object0 process hook returns without work. |
| grTCaptain_8021FE24 | Object0 callback3 returns without work. |
| grTCaptain_8021FE28 | Object2 init invokes Ground_JObjInline1: shared inline forwards JObj/map_id to Ground_801C2ED0 then gobj/map_id/0 to grAnime_801C8138. |
| grTCaptain_8021FE78 | Object2 callback1 returns false; argument unused. |
| grTCaptain_8021FE80 | Object2 process calls lb_800115F4 first, then Ground_801C2FE0(gobj). No local condition; order differs from Figure2 process callback. |
| grTCaptain_8021FEB4 | Object2 callback3 returns without work. |
| grTCaptain_8021FEB8 | Object1 init invokes Ground_JObjInline1: shared inline calls Ground_801C2ED0 then grAnime_801C8138 using map_id and animation index0. |
| grTCaptain_8021FF08 | Object1 callback1 returns false; argument unused. |
| grTCaptain_8021FF10 | Object1 process forwards gobj to Ground_801C2FE0; no local additional work. |
| grTCaptain_8021FF30 | Object1 callback3 returns without work. |
| grTCaptain_OnTouchLine | StageData on_touch_line callback ignores enum_t and returnsNULL DynamicsDesc; no index lookup. |
| grTCaptain_OnCheckShadowRender | StageData shadow-eligibility callback ignores all three arguments and returns true; performs no rendering. |

## Limits

Shared setup installs callback3, calls on_init and schedules gobj_proc; it does not use callback1 or record flags. A zero fourth row does not validate arbitrary IDs. The null generator call does not prove targets were spawned. Canonical int demo argument agrees with the shared slot. Touch-line returns no descriptor and shadow eligibility draws nothing.

Both owned files and183 displayed lines are reviewed in canonical/rendered views. All facts, empty entities, section target and exact outgoing links are recorded with versions. Zero parse errors; pointer-return header aliases are shadowed. Shared types/inlines are context only.
