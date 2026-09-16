# Grkongo Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 1,680 owned C/header lines reviewed in canonical and rendered form.

## grKongo_801D5238

Returns without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L151-L151

## grKongo_801D523C

Caches Ground_GetYakumonoParam(), clears stage_info.unk8C.b4 and sets b5. Calls the local factory with IDs 0,10,5,3,6,4 in order, ignoring results, then Ground_801C39C0 and Ground_801C3BB4. Calls mpLib_80057BC0 for IDs 0 and 1. Only Stage_80225194()!=0x3D and gm_8016B238()==0 together permit Ground_801C53EC(0x5A551). Foreign boundary, collision and sound effects require owner evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L153-L174

## grKongo_801D52F8

Returns without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L176-L176

## grKongo_801D52FC

Obtains Ground_GetMapGObj(5), passes its unchecked result with discriminator 2 and fn_801D8134 to ftCo_800C0764, then calls grZakoGenerator_801CAE04(NULL) and ignores its result. Registry capacity, generator allocation and dispatch semantics are foreign.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L178-L183

## grKongo_801D5338

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L185-L188

## grKongo_801D5340

Forms the unchecked grKg_StageCallbacks[gobj_id] address before Ground_GetStageGObj(gobj_id). A present result clears Ground x8_callback/xC_callback, registers grDisplay_801C5DB0 with GX arguments 3,0, copies a present callback3 to x1C_callback, calls on_init immediately if present, then registers gobj_proc at priority 4 if present. Missing callback3 preserves the previous x1C_callback. callback1 and row flags are never read here. Failed lookup reports ID and returns NULL; success returns the original result.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L190-L216

## fn_801D542C

Gets Ground from the input, calls mpJointSetCb1 for collision joint 4 with gp and fn_801D7700, then sets u.kongo.xE4 to the s16 conversion of (unk4-unk0)*HSD_Randf()+unk0. The owned recurring process later treats -1 as disabled, positive values as countdown and zero as an attempt. Random range validity and deferred-callback timing require foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L218-L231

## grKongo_801D5490

Calls Ground_801C2ED0 and grAnime_801C8138 with map_id and animation 0, sets x10_flags.b5, sets xE4/xE6=-1 and clears xC4/xC8/xD4/xD8. Caches indexed JObjs 0x13,0xD,0x2B,0x28, calls grKongo_801D69B0, passes fn_801D542C to Ground_801C10B8, then calls Ground_801C2FE0. Pointers are not locally checked. The timing and one-shot status of Ground_801C10B8 are delegated. Static registration: row 10 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L233-L255

## grKongo_801D5574

Returns false without input reads, helper calls or state writes. Static registration: row 10 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L257-L260

## grKongo_801D557C

Executes this exact unconditional call order: grKongo_801D7134(gobj,0), grKongo_801D77E0(gobj,0), grKongo_801D7BBC(gobj), lb_800115F4(), Ground_801C2FE0(gobj), mpLib_8005667C(4). Owned calls update the fifteen-entry angular table and model/collision arguments, paired rotation channels and event timer. Wind and derived collision-island semantics require foreign owners. Static registration: row 10 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L262-L270

## grKongo_801D55D4

Returns without input reads, helper calls or state writes. Static registration: row 10 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L272-L275

## grKongo_801D55D8

Calls grAnime_801C8138 and grMaterial_801C94D8. Sets xE4/xE8=1 before replacing xE8 with unk60; clears xD4/xD8/xDC/xE0 and xC4/xC6, sets xC8=2 and retained pointer NULL. Seeds xCC with rand_range((s32)unk30,(s32)unk2C), xCE with rand_range(unk68,unk64). Resolves joint 1, passes it to lb_8000B1CC and supplies position and angle to Ground_801C4D70. No local pointer guards. Static registration: row 5 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L277-L305

## grKongo_801D5774

Returns false without input reads, helper calls or state writes. Static registration: row 5 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L307-L310

## grKongo_801D577C

Runs three sequential state machines. Rotation xC4 states 2/3 compare signed target delta, adjusted upward by TAU once when negative, against 0.5*v*(v/rad(unk34)) and abs(v); v==0 asserts. A small delta changes 3 to 0, while a large delta changes 2 to 3. State 0 brakes with strict step comparisons and may snap current to target; decrements xCC then tests its NEW value<0 before entering 1 with random signed acceleration and a timer from unk40/3C. State 1 adds acceleration, calls Ground_ClampSymmetric with rad(unk38), decrements xCC but tests its OLD value<0 before entering 2 and choosing timer unk30/2C and grKongo_801D8314 target. Always integrates xD8, calls Ground_WrapAngle, writes joint-1 Z rotation, transforms it and calls Ground_801C4D70. Movement xC8 states 0/2 use old-negative xCE countdowns; state 1 increases xE8 until strictly above unk60 then clamps and enters 2; state 3 decreases until strictly below zero then clamps and enters 0. The low-speed timer reads unk58/54 through s32 pointer bitcasts, not numeric casts. Calls grAnime_801C7A04(...,0,7,xE8). Occupancy xC6 state 0 acquires the first qualifying item from grKongo_801D8078, calls it_802E20D8, stores randomized xCA and keep, enters 1 and calls sound/material helpers. State 1 with keep NULL writes state 0 but FALLS THROUGH to case 2, which dereferences keep->p_link; it is not a safe cancellation. A non-NULL keep waits while old xCA-->=0, otherwise enters 2. Case 2 copies the hit template, reads unk6C through unk80 through u32 pointer bitcasts, derives degrees from pi/2+xD8 with one wrap correction, calls ftCo_8009EC70 for p_link 8 or it_802E2330 for 9, then enters 3 and calls sound/material helpers. Other p_link values still enter 3. State 3 returns to 0 only when grKongo_801D8078 returns NULL. Engine-side launch, transform and material semantics are delegated. Static registration: row 5 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L312-L499

## grKongo_801D5FA4

Returns without input reads, helper calls or state writes. Static registration: row 5 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L501-L501

## grKongo_801D5FA8

Calls grAnime_801C8138(gobj,GET_GROUND(gobj)->map_id,0) once. No local guard or further write. Animation resource traversal and flag interpretation require callee evidence. Static registration: row 4 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L503-L507

## grKongo_801D5FD4

Returns false without input reads, helper calls or state writes. Static registration: row 4 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L509-L512

## grKongo_801D5FDC

Returns without input reads, helper calls or state writes. Static registration: row 4 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L514-L514

## grKongo_801D5FE0

Returns without input reads, helper calls or state writes. Static registration: row 4 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L516-L516

## grKongo_801D5FE4

Calls grAnime_801C8138(gobj,gp->map_id,0), then writes gp->x11_flags.b012=1. No local guards. Animation and flag semantics are delegated. Static registration: row 6 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L518-L525

## grKongo_801D6028

Returns false without input reads, helper calls or state writes. Static registration: row 6 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L527-L530

## grKongo_801D6030

Returns without input reads, helper calls or state writes. Static registration: row 6 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L532-L532

## grKongo_801D6034

Returns without input reads, helper calls or state writes. Static registration: row 6 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L534-L534

## grKongo_801D6038

Calls grAnime_801C8138(gobj,GET_GROUND(gobj)->map_id,0) once. No local guard or further write. Animation resource traversal and flag interpretation require callee evidence. Static registration: row 3 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L536-L540

## grKongo_801D6064

Returns false without input reads, helper calls or state writes. Static registration: row 3 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L542-L545

## grKongo_801D606C

Returns without input reads, helper calls or state writes. Static registration: row 3 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L547-L547

## grKongo_801D6070

Returns without input reads, helper calls or state writes. Static registration: row 3 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L549-L549

## grKongo_801D6074

Calls grAnime_801C8138 with map_id and 0; clears kongo3 xC4/xC6/xC8/xCA and sets xD0=-99999 and xD4=F32_MAX. Compares the OBJECT map_id to Gr_Kind_Test, choosing xCC=45*HSD_Randf()-15 when equal or 9*HSD_Randf() otherwise, then writes root X translation. This comparison does not establish the current stage identity. Static registration: row 1 on_init, row 2 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L551-L572

## grKongo_801D6190

Returns false without input reads, helper calls or state writes. Static registration: row 1 callback1, row 2 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L574-L577

## grKongo_801D6198

State xC4=0 waits for grAnime_801C83D0(gobj,0,1)!=0, then supplies geometry to collision helpers, activates joint 0 when OBJECT map_id==Gr_Kind_Test or joint 1 otherwise, installs fn_801D7E60 with Ground context and enters 1. State 1 increments xCA; if xC8==xC6 clears both, otherwise copies xC6 to xC8. If xC6>unk88, xCA>unk8C or grKongo_801D7F78 is nonzero, calls grAnime_801C8138(...,1), removes and clears the selected joint/callback, then enters 2. State 2 calls Ground_801C4A08 when grAnime_801C83D0 is nonzero. Animation predicate and teardown effects require owner evidence. fn_801D7E60 writes xC6=xC8+1, so repeated notifications before this process snapshots do not each increment the streak. Static registration: row 1 gobj_proc, row 2 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L579-L630

## grKongo_801D6378

Returns without input reads, helper calls or state writes. Static registration: row 1 callback3, row 2 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L632-L635

## grKongo_801D637C

Calls grAnime_801C8138(gobj,map_id,0) and grAnime_801C78FC(gobj,0,7). Sets xCC to 45*Randf()-15 for OBJECT map_id==Gr_Kind_Shrine, 20*Randf()-10 for Gr_Kind_Zebes, or 9*Randf() otherwise; copies xCC to root X. Enum comparisons are object-ID branches, not current-stage selection. No local state loop or pointer guards. Static registration: row 7 on_init, row 8 on_init, row 9 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L672-L690

## grKongo_801D64B4

Returns false without input reads, helper calls or state writes. Static registration: row 7 callback1, row 8 callback1, row 9 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L692-L695

## grKongo_801D64BC

Uses short-circuit OR: grAnime_801C83D0(gobj,0,1) is queried first; only if zero is grAnime_801C84A4(gobj,0,1) queried. Either nonzero calls Ground_801C4A08 with the same gobj. Exact animation flags, completion and destruction effects require callee evidence. Static registration: row 7 gobj_proc, row 8 gobj_proc, row 9 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L697-L704

## grKongo_801D6518

Returns without input reads, helper calls or state writes. Static registration: row 7 callback3, row 8 callback3, row 9 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L706-L709

## grKongo_801D651C

Copies three owned grKg_SplineChoice pairs {7,4},{8,5},{9,6}; chooses one using HSD_Randi(3), passes its file/spline fields to Ground_801C247C and retains the result. Clears xC8/xD0/xCC, sets xD8=-99999 and xDC=F32_MAX, calls splArcLengthPoint at progress 0 and copies output to root translation. No local spline/model guards. Pair field meanings are documented in the owned static header. Static registration: row 11 on_init.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L711-L734

## grKongo_801D6660

Returns false without input reads, helper calls or state writes. Static registration: row 11 callback1. The owned factory never reads callback1; table membership alone does not prove runtime predicate dispatch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L745-L748

## grKongo_801D6668

Starts with step 0.001. Only if progress+step<=1 does it sample splArcLengthPoint twice and estimate separation using a reciprocal-square-root estimate and three Newton refinements for positive squared distance. Positive distance permits step*=unk14/distance and progress+=step, with only an upper clamp to 1. Zero/unordered distance leaves progress unchanged; progress just below 1 with progress+0.001>1 can remain stranded below the endpoint. Negative unk14 is not rejected and there is no lower clamp. Ground_801C4B50 supplies position/rotation for the resulting progress; the old translation is captured, new translation applied, and rotation receives x/y/z with w=1. Retains greatest Y and least Z. Only old drop<5 AND new drop>5 relative to the updated maximum calls Ground_801C5440(gp,0,0x5A550) and Ground_801C5630(gp,0,1-z/minZ). Equality does not trigger; minZ has no zero guard and the scalar is not locally normalized or clamped. Static registration: row 11 gobj_proc.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L750-L822

## grKongo_801D69AC

Returns without input reads, helper calls or state writes. Static registration: row 11 callback3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L824-L824

## grKongo_801D69B0

Resolves all fifteen grKg_803E188C configured JObj indices, stores each pointer, copies initial unk8 to live unkC and writes X rotation. Caches JObjs 0xB and 0x21, calls grKongo_801D7134(gobj,1), grKongo_801D77E0(gobj,1), then mpJointSetB10(4). The 7134 input value 1 has no mode semantics because that function overwrites it as a loop counter; only 77E0 uses nonzero as reset. No local lookup guards.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L826-L843

## grKongo_801D6AFC

Processes fifteen records. Calls owned rad_compare_b with live-minus-initial angle, unk94 and velocity; clamps velocity with Ground_ClampSymmetric and rad(unk98), integrates angle, then clamps the ABSOLUTE angle with rad(unk90). Neighbor differences beyond rad(unk9C) produce unkA0-scaled corrective deltas only when both participating unk2 fields are zero. Corrections are accumulated in scratch and added after all records are scanned. There is NO post-neighbor clamp, so the final angle is not guaranteed to remain inside the preceding bound. Initial scratch-zero additions have no effect. Foreign clamp handling of invalid limits is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L859-L964

## grKongo_801D7134

Calls grKongo_801D6AFC and overwrites arg1 as a fifteen-entry loop counter, discarding its supplied value. Computes unk14=37.8*tanf(-unkC). At indices 2 and 12 sets cached support X rotation to angle*(rad(unkA8)/rad(unk90)-1) and Z rotation to owned grKongo_calc_angle. Only abs(newZ-oldZ)>rad(unkB0) overwrites xC8 or xD8 with the negated delta; otherwise preserves that field. Writes all fifteen segment X rotations, calls mpLib_80057424(4), then supplies each derived Y to both endpoints of collision lines 0x28..0x44 at stride 2, plus outer lines 0x27 and 0x45. No divisor or pointer guards. Collision snapshot/commit meaning requires mpLib evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L992-L1069

## fn_801D7700

Only coll->x34_flags.b1234 values 1 or 3 together with ground_kind==mpLib_GroundEnum_Unk1 permit a write. Reads collision vertices 0x1D and 0x1A, divides their X span by 15, truncates the relative coll X ratio to s32, clamps index to 0..14, and adds 0.017453292*unkA4 to that record unk10. Other callback arguments are unused. A zero span and nonfinite ratios are not guarded.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1072-L1109

## grKongo_801D77E0

Nonzero arg1 clears angle/velocity pairs xC4/xC8 and xD4/xD8. Otherwise processes two channels by advancing a Ground pointer 0x10 bytes: a positive angle subtracts radfactor*unkB4 from velocity when velocity is positive, half that otherwise; a negative angle uses the corresponding addition. Integrates velocity into angle. Exact bound is radfactor*(unkB8-radfactor*unkAC), including the nested conversion. Crossing either bound clamps and clears velocity; otherwise strictly small angle AND velocity relative to radfactor*unkB4 clear both. Writes each angle to its two stored JObj Z rotations. Invalid parameter limits and pointers have no local guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1111-L1167

## grKongo_801D7BBC

Timer xE4>0 decrements first, then the NEW value is tested: -1 disables and any other nonzero value returns. Thus an incoming timer of 1 reaches zero and selects an event on the same invocation. At zero, obtains a weighted roll with conditional Box weight, then resets timer before selection or repeat suppression. Subtracts unk8 for event 1, eligible unkC for event 2, and unk10*unk18 for event 3 with ID 1/2; remaining unk10*(1-unk18) selects event 3 with ID 7/8/9. A missed ladder returns. Same event as xE6 is suppressed when Randf()>unk1C, after timer reset and without resampling. Otherwise stores xE6 before creation. Events 1/2 create Ground ID 11 and only a non-NULL Ground result proceeds to it_802E18B4 or it_80286088; a NULL item result calls Ground_801C4A08 on that Ground. Event 3 calls the factory for its selected ID. Failed creation still retains the event record. Match-rule, item eligibility and constructor meanings require foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1169-L1279

## fn_801D7E60

Treats user_data as Ground. Only ground_kind==mpLib_GroundEnum_Unk2 writes kongo3.xC6=kongo3.xC8+1. It does NOT increment xC6 itself and does not check lifecycle state. Repeated notifications before grKongo_801D6198 snapshots xC6 into xC8 write the same value. Other callback inputs are unused.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1282-L1289

## grKongo_801D7E78

Requires a non-NULL input gobj before checking its Ground payload. For OBJECT map_id Test/Castle/Shrine/Zebes/Kraid, obtains indexed JObj 2 and, if present, calls lb_8000B1CC into out_pos and returns out_pos. Yorster uses root local translation when root exists. Missing Ground, unsupported ID or missing required joint returns NULL without writing output. Output pointer is not checked; root-local and helper-transformed coordinates need not share a frame without owner evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1291-L1323

## grKongo_801D7F78

Returns false when local grKongo_801D7E78 cannot resolve the input. Scans HSD_GObj_Entities->x14, excluding pointer identity and skipping unresolvable candidates. Returns true at the first candidate with strict -150<other.z-self.z<-100 and (other.x-self.x)^2<6400; ignores Y. Returns false on exhaustion. Owned state-1 controller uses true as one exit guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1325-L1358

## grKongo_801D8058

Immediately calls Ground_801C4A08 with the unchanged Ground_GObj pointer. No local guard or other write. Item-side ownership, pointer clearing and Ground teardown internals are outside this body.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1360-L1363

## grKongo_801D8078

Ignores input gobj. Obtains a position from Ground_801C4DA0, scans HSD_GObj_Entities->items in list order, restricts to It_Kind_Klap, gets each candidate position through it_8026B294 and returns the first strict 3D squared distance<unk28*unk28 match. Returns NULL if none. This is first match, not nearest; a negative radius still squares positive and unordered comparisons fail.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1365-L1395

## fn_801D8134

Only kongo3.xC6==0 proceeds to compare Ground_801C4DA0 and candidate position with strict squared 3D distance<unk28*unk28. Success casts a randomized unk20..unk24 delay to s16, stores arg1 cast to HSD_JObj* in xD0, sets xC6=1, calls Ground_801C5440(...,0x129), grMaterial_801C9604, efSync_Spawn(0x405,...) and ftLib_80086C18(...,0xD,0x1E), then returns 1. Other paths return 0. Engine-side effects and union alias meaning require owner evidence. Contrary to the inherited state claim, the paired process does not safely cancel a missing keep pointer: state 1 writes zero then falls through into case 2 and dereferences it.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1397-L1435

## grKongo_801D8270

Reads u.inishie2.xC6 and changes 1 to 2, leaving all other values unchanged. No local return value or helper call. Equivalence to the differently spelled kongo3 occupancy field and the manual-input caller contract require Ground union/caller evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1437-L1443

## grKongo_801D828C

Returns unless kongo3.xC6==1. Asserts retained taru.keep is non-NULL, then tests raw byte 2 of that retained object against 8. Equality clears xC6 and keep and calls grMaterial_801C95C4; other values preserve them. Raw byte-to-p_link equivalence and invalid-capture interpretation require owner type/caller evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1445-L1457

## grKongo_801D8314

Sums eight signed16 weights unk44..unk52. Nonzero sum is passed to HSD_Randi; zero sum uses zero. Sequential subtraction selects the first strictly negative bucket and returns one of eight source radian literals corresponding to 135,90,45,0,-45,-90,-135,-180 degrees. If no bucket succeeds, asserts. All-zero weights therefore assert; there is no default angle. Negative weights are not validated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1459-L1517

## grKongo_801D8444

Returns false converted to DynamicsDesc* NULL for every enum_t input, with no input reads, helper calls or writes. Descriptor stores this function in its touch-line position; actual dispatch meaning requires StageData consumer evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1519-L1522

## grKongo_801D844C

Calls lb_8000B1CC(jobj,NULL,&vec), then returns a->y>vec.y. The integer argument is unused. Equality and unordered comparison return false; no input pointer guards or persistent writes. Shadow/fighter identity and coordinate-transform internals require foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L1524-L1533

## .data

Owned source declares six GrJoint triples, twelve callback rows, a StageData descriptor, hit template, fifteen mutable joint records, spline choices and cached pointers. Exact compiler section assignment, pooled literal order, byte extent and padding require object/compiler evidence; no binary-layout claim is inferred from declarations alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L45-L149

## .rodata

Owned source declares six GrJoint triples, twelve callback rows, a StageData descriptor, hit template, fifteen mutable joint records, spline choices and cached pointers. Exact compiler section assignment, pooled literal order, byte extent and padding require object/compiler evidence; no binary-layout claim is inferred from declarations alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L45-L149

## .sbss

Owned source declares six GrJoint triples, twelve callback rows, a StageData descriptor, hit template, fifteen mutable joint records, spline choices and cached pointers. Exact compiler section assignment, pooled literal order, byte extent and padding require object/compiler evidence; no binary-layout claim is inferred from declarations alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L45-L149

## .sdata

Owned source declares six GrJoint triples, twelve callback rows, a StageData descriptor, hit template, fifteen mutable joint records, spline choices and cached pointers. Exact compiler section assignment, pooled literal order, byte extent and padding require object/compiler evidence; no binary-layout claim is inferred from declarations alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L45-L149

## .sdata2

Owned source declares six GrJoint triples, twelve callback rows, a StageData descriptor, hit template, fifteen mutable joint records, spline choices and cached pointers. Exact compiler section assignment, pooled literal order, byte extent and padding require object/compiler evidence; no binary-layout claim is inferred from declarations alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L45-L149

## file

Registers Gr_Kind_Kongo and /GrKg.dat with six joint triples and twelve callback rows, including a zero row 0. Initializer configures IDs 0,10,5,3,6,4. Owned controllers maintain fifteen angular records and corresponding geometry arguments, paired rotations, three sequential occupancy/motion state machines, randomized event selection, transient collision callbacks and spline progress. Source fields and named enums establish local behavior; visible stage identity, archive objects and foreign helper effects remain separate evidence questions.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L45-L149

## Owned Helpers and Types

rad_compare_b: Restoration is -rad(b), +rad(b) or zero using strict a comparisons, then ret=(f32)(0.99*(f64)(restoration+ret)). Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L845-L857

grKongo_calc_angle: Averages left/right neighboring height slopes divided by 6, multiplies by 0.7853981633974483 and clamps to +/-rad(unkAC). Only indices 2 and 12 are used locally. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L966-L982

grKg_sdata2_order: MUST_MATCH-only inline references two discarded literals; no runtime state effect shown. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L985-L989

_struct_grKg_804D6984: Two HSD_JObj pointers cached from indices 0xB and 0x21. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L637-L642

_struct_grKg_803E188C_0x18: Two s16 values, a JObj pointer and four f32 values. Fifteen initializers use indices 8,9,A,17,18,19,1A,1B,1C,1D,1E,1F,20,7,2D. Initial angles are explicit; last field is implicitly zero. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L644-L670

grKg_SplineChoice and grKg_SplineChoiceList: Two s32 file/spline indices; list stores three pairs and an s32 terminator. C736-743 defines {7,4},{8,5},{9,6},0. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.static.h#L11-L21

grKongo_YakumonoParam: Mostly f32; eight s16 weights at 44-52 and s32 fields64,68,84. Float-declared54/58 and6C-80 are locally consumed through integer pointer bitcasts. Static cache is line79. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.static.h#L23-L75

The public header declares 52 public functions and StageData; four other local definitions are declared in the C file. Both headers were reviewed through physical EOF. Canonical definition signatures drive this packet.

## Read Receipts

[src/melee/gr/grkongo.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.c.1-220.json)

[src/melee/gr/grkongo.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.c.1101-1320.json)

[src/melee/gr/grkongo.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.c.1321-1534.json)

[src/melee/gr/grkongo.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.c.221-440.json)

[src/melee/gr/grkongo.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.c.441-660.json)

[src/melee/gr/grkongo.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.c.661-880.json)

[src/melee/gr/grkongo.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.c.881-1100.json)

[src/melee/gr/grkongo.h canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.h.1-64.json)

[src/melee/gr/grkongo.static.h canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grkongo/pages/src__melee__gr__grkongo.static.h.1-82.json)


## Registration and Constant Records

C45-48 defines six GrJoint triples: {2,10,19}, {3,10,22}, {5,10,43}, {6,10,44}, {0,1,0}, {1,2,2}. Callback row 0 is zero; row 10 alone has bits 30 and 31 set. The local factory ignores those row flags. The StageData descriptor sets bit 0 and records the joint count through ARRAY_SIZE. C147-149 defines the hit template {HitCapsule_Enabled,1,361,0,0,180,0,0,0}; the process copies and specializes it.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grkongo.c#L45-L149
