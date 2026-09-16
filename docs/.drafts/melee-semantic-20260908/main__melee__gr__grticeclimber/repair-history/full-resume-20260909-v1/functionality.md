# TIceclimber Semantic Review

All 230 owned canonical/rendered lines, 22 functions, one data target, 25 entities and 119 facts reviewed. 24 empty parameter entities have explicit dispositions. {'unresolved': 28, 'retain': 47, 'supersede': 44}; 44 proposed writes. All 27 outgoing links reviewed.

## grTIceClimber_80220F10

Empty demo-init hook. Definition and declaration take bool while shared StageData field spells int. No input semantics or boolean-sized ABI is established by the unused argument.

## grTIceClimber_80220F14

Calls Ground_InitTargetStage with setupStageCallbacks. The reviewed inline clears stage_info.unk8C.b4, sets b5, calls setup for IDs 0,1,2, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. It ignores setup return values.

## grTiceclimber_UnkStage0_OnLoad

Empty stage load hook with no calls or state changes.

## grTiceclimber_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once and ignores its return. No local retry, guard or recovery; a null argument does not by itself prove default spawn semantics or target creation.

## grTIceClimber_80220FAC

StageData callback4 always returns false without reading state or making calls.

## setupStageCallbacks

Forms an unchecked signed-index address into the four-entry callback array before Ground_GetStageGObj. Nonnull result enters setup; null result reports filename, fixed value 202 and ID. Returns the lookup result. Shared setup clears Ground x8/xC callbacks, registers GX link 3 priority 0, stores nonnull callback3, invokes on_init and schedules gobj_proc at priority 4; it ignores callback1 and flags. No scan or null-row termination occurs here.

## stageGObj0_OnInit

Row-0 on_init reads Ground user_data map_id and calls grAnime_801C8138(gobj,map_id,0). No local null guard; detailed animation replacement and archive behavior are delegated.

## stageGObj0_Callback1

Row-0 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate, so table membership does not establish runtime dispatch.

## stageGObj0_GObjProc

Row-0 gobj_proc is empty and ignores its pointer.

## stageGObj0_Callback3

Row-0 callback3 is empty and ignores its pointer.

## stageGObj2_OnInit

Row-2 on_init calls Ground_JObjInline1, then grAnime_801C7FF8(gobj,69,2,1,0.0F,1.0F), then grTIceClimber_80221288. Shared inline calls Ground_801C2ED0 then grAnime_801C8138 with map_id and zero. No local guards or result checks.

## stageGObj2_Callback1

Row-2 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## stageGObj2_GObjProc

Row-2 gobj_proc calls lb_800115F4 first, then Ground_801C2FE0(gobj). No direct field writes or local guards; wind/collision semantics need callee evidence.

## stageGObj2_Callback3

Row-2 callback3 is empty and ignores its pointer.

## stageGObj1_OnInit

Row-1 on_init invokes Ground_JObjInline1, which calls Ground_801C2ED0 using JObj/map_id before grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## stageGObj1_Callback1

Row-1 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## stageGObj1_GObjProc

Row-1 gobj_proc calls Ground_801C2FE0(gobj) once, without lb_800115F4. No local guard or field write.

## stageGObj1_Callback3

Row-1 callback3 is empty and ignores its pointer.

## grTIceClimber_80221354

StageData on_touch_line ignores enum_t argument and returns NULL; no DynamicsDesc is selected. This does not establish absence of ordinary collision.

## grTIceClimber_8022135C

StageData shadow-check ignores all arguments and returns true. This hook rejects no query; actual shadow submission remains the caller's responsibility.

## grTIceClimber_80221208

Uses only the Item_GObj argument. Reads Item mato.x4 JObj, passes it to HSD_JObjSetFlagsAll with JOBJ_HIDDEN, obtains its origin through lb_8000B1CC with null local point, calls efSync_Spawn(0x445,gobj,&pos), Camera_RequestQuake(QuakeKind_Small,NULL), Ground_801C53EC(310), then grMaterial_801C8CDC(gobj). No local damage check or guard. Objective-target identity, effect appearance, audio meaning and destruction semantics require callee/caller evidence.

## grTIceClimber_80221288

Reads Ground user data and scans 40 signed indices until -1: 0..6,8..22,44..61. Trailing zero is not consumed. Calls Ground_801C33C0(2,index), skips -1, otherwise passes Ground_801C3FA4 result and callback grTIceClimber_80221208 to grMaterial_801C8CFC with fixed zero arguments. On nonnull result calls grMaterial_801C8DE0 with (-1,0,0,1,0,0,4), then grMaterial_801C8E08. Does not check the intermediate JObj result or deduplicate. Exact item kind, hit geometry and damage dispatch require callee evidence.

## Limits

Four rows are not proof of terminator scanning; common initialization requests only three IDs. Callback1 and flags are not consumed by setup inline.  Bool callback versus int shared field is a source spelling difference; inspect canonical typedefs before claiming ABI incompatibility. Shared type definitions and inline callees are unowned context. No source, shared knowledge, compilation, matching, publishing or UI changes.
