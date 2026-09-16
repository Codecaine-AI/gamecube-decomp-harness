# TZelda Semantic Review

All 173 owned canonical/rendered lines, 20 functions, one data target, 19 entities and 115 facts reviewed. 18 empty parameter entities have explicit dispositions. {'unresolved': 29, 'retain': 53, 'supersede': 33}; 33 proposed writes. All 28 outgoing links reviewed.

## grTZelda_OnDemoInit

Empty demo-init hook. Definition takes int; preceding declaration spells bool and StageData field takes int. No input semantics or boolean-sized ABI is established by the unused argument.

## grTZelda_OnInit

Calls Ground_InitTargetStage with grTZelda_80223ED0. The reviewed inline clears stage_info.unk8C.b4, sets b5, calls setup for IDs 0,1,2, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. It ignores setup return values.

## grTZelda_OnLoad

Empty stage load hook with no calls or state changes.

## grTZelda_OnStart

Calls grZakoGenerator_801CAE04(NULL) once and ignores its return. No local retry, guard or recovery; a null argument does not by itself prove default spawn semantics or target creation.

## grTZelda_80223EC8

StageData callback4 always returns false without reading state or making calls.

## grTZelda_80223ED0

Forms an unchecked signed-index address into the four-entry callback array before Ground_GetStageGObj. Nonnull result enters setup; null result reports filename, fixed value 0xC3 and ID. Returns the lookup result. Shared setup clears Ground x8/xC callbacks, registers GX link 3 priority 0, stores nonnull callback3, invokes on_init and schedules gobj_proc at priority 4; it ignores callback1 and flags. No scan or null-row termination occurs here.

## grTZelda_80223FB8

Row-0 on_init reads Ground user_data map_id and calls grAnime_801C8138(gobj,map_id,0). No local null guard; detailed animation replacement and archive behavior are delegated.

## grTZelda_80223FE4

Row-0 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate, so table membership does not establish runtime dispatch.

## grTZelda_80223FEC

Row-0 gobj_proc is empty and ignores its pointer.

## grTZelda_80223FF0

Row-0 callback3 is empty and ignores its pointer.

## grTZelda_80223FF4

Row-2 on_init invokes Ground_JObjInline1. Shared inline gets Ground map_id and JObj, calls Ground_801C2ED0, then grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTZelda_80224044

Row-2 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTZelda_8022404C

Row-2 gobj_proc calls lb_800115F4 first, then Ground_801C2FE0(gobj). This order differs from Figure1's active process. No direct field writes or local guards; wind/collision semantics need callee evidence.

## grTZelda_80224080

Row-2 callback3 is empty and ignores its pointer.

## grTZelda_80224084

Row-1 on_init invokes Ground_JObjInline1, which calls Ground_801C2ED0 using JObj/map_id before grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTZelda_802240D4

Row-1 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTZelda_802240DC

Row-1 gobj_proc calls Ground_801C2FE0(gobj) once, without lb_800115F4. No local guard or field write.

## grTZelda_802240FC

Row-1 callback3 is empty and ignores its pointer.

## grTZelda_OnTouchLine

StageData on_touch_line ignores enum_t argument and returns NULL; no DynamicsDesc is selected. This does not establish absence of ordinary collision.

## grTZelda_OnCheckShadowRender

StageData shadow-check ignores all arguments and returns true. This hook rejects no query; actual shadow submission remains the caller's responsibility.

## Limits

Four rows are not proof of terminator scanning; common initialization requests only three IDs. Callback1 and flags are not consumed by setup inline. Row2 process library-before-Ground order differs from Figure1. Bool declaration versus int definition is a source spelling discrepancy; inspect canonical typedefs before claiming ABI incompatibility. Shared type definitions and inline callees are unowned context. No source, shared knowledge, compilation, matching, publishing or UI changes.
