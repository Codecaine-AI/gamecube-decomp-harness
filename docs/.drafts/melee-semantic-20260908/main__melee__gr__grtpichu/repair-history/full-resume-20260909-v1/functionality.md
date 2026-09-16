# TPichu Semantic Review

All 180 owned canonical/rendered lines, 20 functions, one data target, 19 entities and 122 facts reviewed. 18 empty parameter entities have explicit dispositions. {'unresolved': 29, 'supersede': 39, 'retain': 54}; 39 proposed writes. All 27 outgoing links reviewed.

## grTPichu_80222B98

Empty demo-init hook. Definition and declaration take bool while shared StageData field spells int. No input semantics or boolean-sized ABI is established by the unused argument.

## grTPichu_80222B9C

Calls Ground_InitTargetStage with grTPichu_80222C3C. The reviewed inline clears stage_info.unk8C.b4, sets b5, calls setup for IDs 0,1,2, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. It ignores setup return values.

## grTpichu_UnkStage0_OnLoad

Empty stage load hook with no calls or state changes.

## grTpichu_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once and ignores its return. No local retry, guard or recovery; a null argument does not by itself prove default spawn semantics or target creation.

## grTPichu_80222C34

StageData callback4 always returns false without reading state or making calls.

## grTPichu_80222C3C

Forms an unchecked signed-index address into the four-entry callback array before Ground_GetStageGObj. Nonnull result enters setup; null result reports filename, fixed value 0xC2 and ID. Returns the lookup result. Shared setup clears Ground x8/xC callbacks, registers GX link 3 priority 0, stores nonnull callback3, invokes on_init and schedules gobj_proc at priority 4; it ignores callback1 and flags. No scan or null-row termination occurs here.

## grTPichu_80222D24

Row-0 on_init reads Ground user_data map_id and calls grAnime_801C8138(gobj,map_id,0). No local null guard; detailed animation replacement and archive behavior are delegated.

## grTPichu_80222D50

Row-0 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate, so table membership does not establish runtime dispatch.

## grTPichu_80222D58

Row-0 gobj_proc is empty and ignores its pointer.

## grTPichu_80222D5C

Row-0 callback3 is empty and ignores its pointer.

## grTPichu_80222D60

Row-2 on_init invokes Ground_JObjInline1. Shared inline gets Ground map_id and JObj, calls Ground_801C2ED0, then grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTPichu_80222DB0

Row-2 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTPichu_80222DB8

Row-2 gobj_proc calls lb_800115F4 first, then Ground_801C2FE0(gobj). No direct field writes or local guards; wind/collision semantics need callee evidence.

## grTPichu_80222DEC

Row-2 callback3 is empty and ignores its pointer.

## grTPichu_80222DF0

Row-1 on_init invokes Ground_JObjInline1, which calls Ground_801C2ED0 using JObj/map_id before grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTPichu_80222E40

Row-1 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTPichu_80222E48

Row-1 gobj_proc calls Ground_801C2FE0(gobj) once, without lb_800115F4. No local guard or field write.

## grTPichu_80222E68

Row-1 callback3 is empty and ignores its pointer.

## grTPichu_80222E6C

StageData on_touch_line ignores enum_t argument and returns NULL; no DynamicsDesc is selected. This does not establish absence of ordinary collision.

## grTPichu_80222E74

StageData shadow-check ignores all arguments and returns true. This hook rejects no query; actual shadow submission remains the caller's responsibility.

## Limits

Four rows are not proof of terminator scanning; common initialization requests only three IDs. Callback1 and flags are not consumed by setup inline. Bool callback versus int shared field is a source spelling difference; inspect canonical typedefs before claiming ABI incompatibility. Shared type definitions and inline callees are unowned context. No source, shared knowledge, compilation, matching, publishing or UI changes.
