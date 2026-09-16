# TYoshi Semantic Review

All 181 owned canonical/rendered lines, 20 functions, one data target, 19 entities and 116 facts reviewed. 18 empty parameter entities have explicit dispositions. {'unresolved': 32, 'retain': 45, 'supersede': 39}; 39 proposed writes. All 24 outgoing links reviewed.

## grTYoshi_OnDemoInit

Empty demo-init hook. Definition and declaration take bool while shared StageData field spells int. No input semantics or boolean-sized ABI is established by the unused argument.

## grTYoshi_OnInit

Calls Ground_InitTargetStage with grTYoshi_80223BEC. The reviewed inline clears stage_info.unk8C.b4, sets b5, calls setup for IDs 0,1,2, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. It ignores setup return values.

## grTYoshi_OnLoad

Empty stage load hook with no calls or state changes.

## grTYoshi_OnStart

Calls grZakoGenerator_801CAE04(NULL) once and ignores its return. No local retry, guard or recovery; a null argument does not by itself prove default spawn semantics or target creation.

## grTYoshi_80223BE4

StageData callback4 always returns false without reading state or making calls.

## grTYoshi_80223BEC

Forms an unchecked signed-index address into the four-entry callback array before Ground_GetStageGObj. Nonnull result enters setup; null result reports filename, fixed value 195 and ID. Returns the lookup result. Shared setup clears Ground x8/xC callbacks, registers GX link 3 priority 0, stores nonnull callback3, invokes on_init and schedules gobj_proc at priority 4; it ignores callback1 and flags. No scan or null-row termination occurs here.

## grTYoshi_80223CD4

Row-0 on_init reads Ground user_data map_id and calls grAnime_801C8138(gobj,map_id,0). No local null guard; detailed animation replacement and archive behavior are delegated.

## grTYoshi_80223D00

Row-0 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate, so table membership does not establish runtime dispatch.

## grTYoshi_80223D08

Row-0 gobj_proc is empty and ignores its pointer.

## grTYoshi_80223D0C

Row-0 callback3 is empty and ignores its pointer.

## grTYoshi_80223D10

Row-2 on_init invokes Ground_JObjInline1. Shared inline gets Ground map_id and JObj, calls Ground_801C2ED0, then grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTYoshi_80223D60

Row-2 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTYoshi_80223D68

Row-2 gobj_proc calls lb_800115F4 first, then Ground_801C2FE0(gobj). No direct field writes or local guards; wind/collision semantics need callee evidence.

## grTYoshi_80223D9C

Row-2 callback3 is empty and ignores its pointer.

## grTYoshi_80223DA0

Row-1 on_init invokes Ground_JObjInline1, which calls Ground_801C2ED0 using JObj/map_id before grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTYoshi_80223DF0

Row-1 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTYoshi_80223DF8

Row-1 gobj_proc calls Ground_801C2FE0(gobj) once, without lb_800115F4. No local guard or field write.

## grTYoshi_80223E18

Row-1 callback3 is empty and ignores its pointer.

## grTYoshi_OnTouchLine

StageData on_touch_line ignores enum_t argument and returns NULL; no DynamicsDesc is selected. This does not establish absence of ordinary collision.

## grTYoshi_OnCheckShadowRender

StageData shadow-check ignores all arguments and returns true. This hook rejects no query; actual shadow submission remains the caller's responsibility.

## Limits

Four rows are not proof of terminator scanning; common initialization requests only three IDs. Callback1 and flags are not consumed by setup inline. Bool callback versus int shared field is a source spelling difference; inspect canonical typedefs before claiming ABI incompatibility. Shared type definitions and inline callees are unowned context. No source, shared knowledge, compilation, matching, publishing or UI changes.
