# TDonkey Semantic Review

All 176 owned canonical/rendered lines, 20 functions, one data target, 19 entities and 123 facts reviewed. 18 empty parameter entities have explicit dispositions. {'unresolved': 30, 'retain': 59, 'supersede': 34}; 34 proposed writes. All 23 outgoing links reviewed.

## grTDonkey_80220228

Empty demo-init hook. Definition and declaration take bool while shared StageData field spells int. No input semantics or boolean-sized ABI is established by the unused argument.

## grTDonkey_8022022C

Calls Ground_InitTargetStage with grTDonkey_802202CC. The reviewed inline clears stage_info.unk8C.b4, sets b5, calls setup for IDs 0,1,2, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. It ignores setup return values.

## grTdonkey_UnkStage0_OnLoad

Empty stage load hook with no calls or state changes.

## grTdonkey_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once and ignores its return. No local retry, guard or recovery; a null argument does not by itself prove default spawn semantics or target creation.

## grTDonkey_802202C4

StageData callback4 always returns false without reading state or making calls.

## grTDonkey_802202CC

Forms an unchecked signed-index address into the four-entry callback array before Ground_GetStageGObj. Nonnull result enters setup; null result reports filename, fixed value 0xC3 and ID. Returns the lookup result. Shared setup clears Ground x8/xC callbacks, registers GX link 3 priority 0, stores nonnull callback3, invokes on_init and schedules gobj_proc at priority 4; it ignores callback1 and flags. No scan or null-row termination occurs here.

## grTDonkey_802203B4

Row-0 on_init reads Ground user_data map_id and calls grAnime_801C8138(gobj,map_id,0). No local null guard; detailed animation replacement and archive behavior are delegated.

## grTDonkey_802203E0

Row-0 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate, so table membership does not establish runtime dispatch.

## grTDonkey_802203E8

Row-0 gobj_proc is empty and ignores its pointer.

## grTDonkey_802203EC

Row-0 callback3 is empty and ignores its pointer.

## grTDonkey_802203F0

Row-2 on_init invokes Ground_JObjInline1. Shared inline gets Ground map_id and JObj, calls Ground_801C2ED0, then grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTDonkey_80220440

Row-2 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTDonkey_80220448

Row-2 gobj_proc calls lb_800115F4 first, then Ground_801C2FE0(gobj). This order differs from Figure1's active process. No direct field writes or local guards; wind/collision semantics need callee evidence.

## grTDonkey_8022047C

Row-2 callback3 is empty and ignores its pointer.

## grTDonkey_80220480

Row-1 on_init invokes Ground_JObjInline1, which calls Ground_801C2ED0 using JObj/map_id before grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTDonkey_802204D0

Row-1 callback1 ignores its pointer and returns false. Shared setup does not install or invoke this predicate.

## grTDonkey_802204D8

Row-1 gobj_proc calls Ground_801C2FE0(gobj) once, without lb_800115F4. No local guard or field write.

## grTDonkey_802204F8

Row-1 callback3 is empty and ignores its pointer.

## grTDonkey_802204FC

StageData on_touch_line ignores enum_t argument and returns NULL; no DynamicsDesc is selected. This does not establish absence of ordinary collision.

## grTDonkey_80220504

StageData shadow-check ignores all arguments and returns true. This hook rejects no query; actual shadow submission remains the caller's responsibility.

## Limits

Four rows are not proof of terminator scanning; common initialization requests only three IDs. Callback1 and flags are not consumed by setup inline. Row2 process library-before-Ground order differs from Figure1. Bool callback versus int shared field is a source spelling difference; inspect canonical typedefs before claiming ABI incompatibility. Shared type definitions and inline callees are unowned context. No source, shared knowledge, compilation, matching, publishing or UI changes.
