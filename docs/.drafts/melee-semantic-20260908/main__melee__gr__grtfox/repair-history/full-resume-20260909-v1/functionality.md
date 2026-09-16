# grtfox Functionality

TFox registers /GrTFx.dat and three active callback records plus a zero fourth row. Explicit initialization caches parameters, requests objects0,1,2 and continues after failures. Object 2 calls lb_800115F4 before Ground_801C2FE0; object 1 calls only Ground_801C2FE0.

## Entry Points

| Canonical | Behavior |
|---|---|
| grTFox_80220B80 | Demo hook ignores bool and returns; shared StageData slot declares int, so source signature discrepancy is recorded without correction. |
| grTFox_80220B84 | Caches Ground_GetYakumonoParam, sets stage bits4/5 to0/1, requests IDs0,1,2 and ignores returned objects, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. |
| grTFox_UnkStage0_OnLoad | Load hook returns without calls or state changes. |
| grTFox_UnkStage0_OnStart | Calls grZakoGenerator_801CAE04(NULL) once and ignores result; no local guard/retry. Void return is not noreturn. |
| grTFox_80220C24 | StageData callback4 returns false, without calls or state reads. |
| grTFox_80220C2C | Indexes four-row callback table with unchecked signed ID, retrieves same ID with Ground_GetStageGObj, invokes setup only if nonnull else reports failure, and returns lookup result. Shared setup ignores callback1/flags; row3 is zero but does not itself bound IDs. |
| grTFox_80220D14 | Object0 init gets Ground user data and calls grAnime_801C8138(gobj,map_id,0). No pointer guard or local success result. |
| grTFox_80220D40 | Object0 callback1 returns false; argument unused. |
| grTFox_80220D48 | Object0 process hook returns without work. |
| grTFox_80220D4C | Object0 callback3 returns without work. |
| grTFox_80220D50 | Object2 init invokes Ground_JObjInline1: shared inline forwards JObj/map_id to Ground_801C2ED0 then gobj/map_id/0 to grAnime_801C8138. |
| grTFox_80220DA0 | Object2 callback1 returns false; argument unused. |
| grTFox_80220DA8 | Object2 process calls lb_800115F4 first, then Ground_801C2FE0(gobj), with no local condition. |
| grTFox_80220DDC | Object2 callback3 returns without work. |
| grTFox_80220DE0 | Object1 init invokes Ground_JObjInline1: shared inline calls Ground_801C2ED0 then grAnime_801C8138 using map_id and animation index0. |
| grTFox_80220E30 | Object1 callback1 returns false; argument unused. |
| grTFox_80220E38 | Object1 process forwards gobj to Ground_801C2FE0; no local additional work. |
| grTFox_80220E58 | Object1 callback3 returns without work. |
| grTFox_80220E5C | StageData on_touch_line callback rejects only input-1 locally, calls mpJointFromLine and requires result1, then uses mpLineGetKind to return cached unk0 for Floor,unk4 for Ceiling,unk8 for RightWall,unkC for LeftWall. Other cases returnNULL. Matching cases dereference yakumono_param without checking initialization; returned entries may beNULL. Other invalid line IDs are delegated to mplib. |
| grTFox_80220F08 | StageData shadow-eligibility callback ignores all three arguments and returns true; performs no rendering. |

## Limits

Shared setup installs callback3, calls on_init and schedules gobj_proc; it does not use callback1 or record flags. A zero fourth row does not validate arbitrary IDs. The null generator call does not prove targets were spawned. Canonical bool demo argument differs from the shared int slot. Touch-line selects four surface descriptors for joint1; it checks neither parameter-cache initialization nor general line validity. Shadow eligibility draws nothing.

Both owned files and197 displayed lines are reviewed in canonical/rendered views. All facts, empty entities, section target and exact outgoing links are recorded with versions. Zero parse errors; pointer-return header aliases are shadowed. Shared types/inlines are context only.
