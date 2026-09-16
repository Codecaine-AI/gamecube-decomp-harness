# Test Semantic Review

All 237 owned canonical/rendered lines, 21 functions, four data targets, 20 entities and 144 facts reviewed. 19 empty parameter entities have explicit dispositions. {'unresolved': 43, 'supersede': 46, 'retain': 55}; 46 proposed writes. All 31 outgoing links reviewed.

## grTest_80206E2C

Empty demo-init hook; bool parameter unused. Shared descriptor field spells int; no ABI or argument-semantics conclusion.

## grTest_80206E30

Writes stage_info.unk8C.b4=0 and b5=1, calls setup for IDs 0,2,1 in that order. After ID2, assigns grTest_802073B0 to Ground.x8_callback; after ID1, gets its JObj and calls scale setters X,Y,Z with 80.0. Calls Ground_801C39C0 then Ground_801C3BB4. Does not guard failed ID2/ID1 results before dereferencing; unlike the factory, this caller cannot safely continue through a NULL result.

## grTest_UnkStage0_OnLoad

Empty load hook, no calls or state changes.

## grTest_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once and ignores the result. No local guard, retry or recovery. Allocation, item types and default configuration remain delegated and unverified.

## grTest_8020703C

StageData callback4 always returns false, without calls or state access.

## grTest_80207044

Forms unchecked signed-index address into four-entry callback table before Ground_GetStageGObj. Nonnull result enters Ground_SetupStageCallbacks; null result reports __FILE__,209,and ID. Returns lookup result. Shared setup clears x8/xC, registers GX link3 priority0, stores nonnull callback3, invokes on_init and schedules proc priority4; callback1 and flags are not consumed. No table scan or allocation behavior is established here.

## grTest_80207130

Row0 on_init reads Ground via GET_GROUND and calls grAnime_801C8138(gobj,map_id,0). No local guard; archive/model/animation effects require callee review.

## grTest_8020715C

Row0 callback1 ignores pointer and returns false. Shared setup does not install or invoke this slot.

## grTest_80207164

Row0 gobj_proc is empty and ignores pointer.

## grTest_80207168

Row0 callback3 is empty and ignores pointer.

## grTest_8020716C

Row2 on_init calls Ground_JObjInline1. Reviewed inline gets Ground and JObj, calls Ground_801C2ED0(JObj,map_id), then grAnime_801C8138(gobj,map_id,0). No local guard or result check.

## grTest_802071BC

Row2 callback1 ignores pointer and returns false. Shared setup does not install or invoke this slot.

## grTest_802071C4

Row2 gobj_proc first checks slot1 A trigger and looks up index16, then slot2 A trigger and index17. Each successful lookup tests bit0x10, calls clear/set JOBJ_HIDDEN accordingly, and resets grTe_804D6A48 to zero; failed lookups skip only that toggle/reset. Slot1 held X (0x400) subtracts 0.08726646f if angle>-1.2217305f; held Y (0x800) then adds the same step if angle<1.2217305f. Independent ordered guards are not a hard clamp; both buttons can execute, second guard sees first update, floating-point steps can cross the threshold. Finally lookup index11; if nonnull pass current angle to HSD_JObjSetRotationZ. Reviewed setter asserts nonnull and non-quaternion mode, writes rotate.z, conditionally marks matrix dirty. No angle reset in stage init; persistent global is reset here only on successful toggles.

## grTest_802073AC

Row2 callback3 is empty and ignores pointer.

## grTest_802073B0

Auxiliary callback explicitly installed into object2 Ground.x8_callback by stage init, separate from row2 gobj_proc. Calls Ground_801C2FE0 once. No local guard or result use; collision internals and caller scheduling remain unverified.

## grTest_802073D0

Row1 on_init reads Ground via GET_GROUND and calls grAnime_801C8138(gobj,map_id,0), with no local guard. Stage init subsequently calls all three scale setters with80. Archive/model/animation internals remain delegated.

## grTest_802073FC

Row1 callback1 ignores pointer and returns false. Shared setup does not install or invoke this slot.

## grTest_80207404

Row1 gobj_proc is empty and ignores pointer.

## grTest_80207408

Row1 callback3 is empty and ignores pointer.

## grTest_8020740C

Touch-line descriptor callback ignores enum_t input and returns false spelled as the null pointer constant. Supplies no DynamicsDesc; this does not establish absence of ordinary collision.

## grTest_80207414

Shadow-check ignores all three arguments and returns true. No query is rejected by this hook; actual shadow submission is unreviewed.

## Limits

Joint table has 13 literal triples; field meanings require consumers. Fourth callback row is zero but no scan exists. Init requests0,2,1 and dereferences ID2/ID1 results without guards; factory NULL handling is not caller recovery. Independent X/Y guards are ordered, not a hard clamp; both buttons can update in one invocation. Three generic stageGObj aliases need unique naming review. Physical sections, debug availability and unread callee internals remain unresolved. No source, shared knowledge, compilation, matching, publishing or UI changes.
