# Grizumi Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 938 owned C/header lines reviewed in canonical and rendered form.

## grIzumi_801CBDD4

Row-0 on_init calls grAnime_801C8138(gobj,GET_GROUND(gobj)->map_id,0) once. No local guard; resource and animation internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L260-L263

## grIzumi_801CBE00

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L265-L268

## grIzumi_801CBE08

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L270-L273

## grIzumi_801CBE0C

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L275-L278

## grIzumi_801CBE10

Row-1 on_init calls grAnime_801C8138(gobj,gp->map_id,0), then sets gp->x11_flags.b012=1. No local guard; field meaning and animation internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L280-L285

## grIzumi_801CBE54

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L287-L290

## grIzumi_801CBE5C

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L292-L295

## grIzumi_801CBE60

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L297-L300

## grIzumi_801CBE64

Row-3 on_init calls Ground_801C2ED0 and grAnime_801C8138, sets x11_flags.b012=1 and x10_flags.b5=1, and stores Ground_801C3FA4 results for indices 1/2. Creates local reflection state and searches for its image TObj. A found TObj gets src/wrap_s/wrap_t=0 and flags=(flags & ~0x1FF)|0x103; missing TObj only reports a warning. Stores that possibly NULL TObj and installs grIzumi_801CD220 regardless. Calls star setup and grLib_801C96F8 twice with 0x7534/0x7536 and bank 0x1E: first position is zero, second starts (0,1,-27) and each axis separately multiplies a Ground_801C0498 result. Creates ID 2 and links its user-data x18 to reflection state. Calls lb_8000B1CC for indices 4 and 6 and constructs two ID-4 objects with parameter heights x0/x8 and IDs 0/1, assigning each xDC=xC, b3=1 and x18 to reflection state. Many returned pointers are used without local guards.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L302-L367

## grIzumi_801CC0CC

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L369-L372

## grIzumi_801CC0D4

If xCC is non-NULL, independently copies xD0/xD4 translations, when present, into its xC4/xC8 JObjs. If copied y<0 and bit0x10 is clear, calls HSD_JObjSetFlagsAll(...,JOBJ_HIDDEN); otherwise for y>=0 or unordered y and bit0x10 set, calls HSD_JObjClearFlagsAll. Destination pointers are not locally checked. Calls lb_800115F4 unconditionally after both pairs, even with no auxiliary object.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L374-L412

## grIzumi_801CC338

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L414-L417

## grIzumi_801CC33C

Row-4 on_init clears Ground x8_callback and xC_callback unconditionally. No parameter reads, local branching or other explicit writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L419-L424

## grIzumi_801CC350

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L426-L429

## grIzumi_801CC358

Controls xC4 states 0–4. State0 enters 1, obtains timer from rand_range(x3C,x38) and requests transform update. State1 uses old xC6 in xC6--<0; when expired, draw HSD_Randf()*(x40+x44+x48), subtract x40, then x48. First negative branch sets state2,target xD4=-1; second selects displacement in x18..x1C, biases its sign using current xD0 versus xDC and thresholds x30/x34 or 0.5, modifies xD4 and uses if target>x20 to assign x20, else if target<x24 to assign x24; remaining branch restarts timer. State2 compares target-current: upward snap only if delta<x28; downward snap only if -delta<x2C. A downward snap enters3 only below x24; other snaps or zero/unordered delta enter0. Exact-step downward subtraction can reach the target and then take the zero-delta state0 path without the below-bound check. State3 enters4, loads rand_range(x50,x4C), hides root, removes animations and moves xCC to rootY-1. State4 uses the same post-decrement negative test, enters2 with target=xDC, unhides and calls grAnime_801C7FF8(gobj,0,7,0,0,1). States0 and2, plus state4 on expiry, request transform updates. Only requested updates with a non-NULL first child compute current/(double)xD8, clamp below0.01, set child scaleX=0.5*f+0.5 and scaleY=f, and set xCC Y=current. No denominator guard or NaN rejection. Finally calls mpLib_80055E9C(xC8) for every state, including unknown states.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L431-L560

## grIzumi_801CCA10

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L562-L565

## grIzumi_801CCA14

Shared on_init for rows5–10 calls grAnime_801C8138(gobj,gp->map_id,0), then clears x8_callback and xC_callback. Animation internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L567-L573

## grIzumi_801CCA54

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L575-L578

## grIzumi_801CCA5C

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L580-L583

## grIzumi_801CCA60

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L585-L588

## grIzumi_801CCA64

Row2 on_init calls grAnime_801C8138, clears x8_callback/xC_callback, calls HSD_GObjGXLink_8039084C, registers grDisplay_801C5DB0 with GX arguments2,0, then stores indexed Ground_801C3FA4 results2/3 in xC4/xC8 and passes each to HSD_JObjSetFlagsAll with JOBJ_HIDDEN. There are no local selected-joint guards.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L590-L602

## grIzumi_801CCB08

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L604-L607

## grIzumi_801CCB10

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L609-L612

## grIzumi_801CCB14

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L614-L617

## grIzumi_801CCB18

Ignores its input. Requests GrdIzumiStar_TopN_joint from grDatFiles_GetArchive()->unk0. If the export exists, calls Ground_801C1A20(j,-1); if the result exists, registers grIzumi_801CCB90 with GX arguments3,0 and sets its Ground x11_flags.b012=2. Does not return or store the result locally; archive base itself is unguarded.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L619-L631

## grIzumi_801CCB90

Calls HSD_StateSetPointSize(18,0), then grDisplay_801C5DB0(gobj,renderpass). Registered by the star-export setup. No local object writes or point-state restoration; the physical pixel interpretation of18 requires GX evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L633-L639

## grIzumi_801CCBDC

Calls local factory ID4, checks GObj, Ground and root JObj, copies *a to root translation, stores height in current xD0 and target xD4, b in xC8 and supplied jobj in xCC. Negative height sets state3; other values set0 and call grAnime_801C7FF8(gobj,0,7,0,0,1). For selected joint2, computes xD8=(lb_8000B1CC outputY-original aY)/Ground_801C0498(); absent joint uses45.0. Invokes the local state process immediately, then returns GObj. Failed GObj/Ground/root checks report and spin forever. No a pointer or divisor guard; no partial object is returned.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L641-L687

## grIzumi_801CCD98

Calls GObj_Create(0x11,0x12,0) and lb_80013B14(&ReflectCObjDesc), attaches camera-kind object, registers grIzumi_801CCEA0 via GObj_SetupGXLinkMaxSorted(...,2), allocates IzumiReflection and installs user data with HSD_Free. Retrieves grDatFiles_801C6330(3)->unk0 export GrdIzumi_cd_wt_GrdIzumiDummy1_1_image_desc. Present image descriptor is zeroed then passed to lb_800121FC(image,80,60,4,2001); missing image reports and asserts. Allocation/archive pointers have no local guards. texture_matrix is not initialized here. Returns the camera GObj.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L717-L739

## grIzumi_801CBB84

Returns without reading its input, calling helpers or writing state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L178-L181

## grIzumi_801CBB88

Caches Ground_GetYakumonoParam(), clears stage_info.unk8C.b4 and sets b5. Calls the local factory with IDs 0,1,3 in order, passes the ID-3 result unguarded to grAnime_801C8780 with 3,0,0.0f,1.0f, then calls Ground_801C39C0 and Ground_801C3BB4. Foreign animation and range effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L183-L196

## grIzumi_OnLoad

Scans HSD_GObj_Entities->xC for the first classifier-0xC GObj. For each LObj in that object, calls HSD_ForeachAnim with LOBJ_TYPE, ALL_TYPE_MASK, HSD_AObjSetFlags, AOBJ_ARG_AU and AOBJ_LOOP. Returns after that first matching GObj even if its light chain is empty; later matching GObjs are not processed. Foreign animation traversal and playback details are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L198-L216

## grIzumi_OnStart

Calls grZakoGenerator_801CAE04(NULL) once and ignores its result. No local guard, retry or state write; generator internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L218-L221

## grIzumi_801CBCE0

Returns false without input reads, helper calls or state writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L223-L226

## grIzumi_801CBCE8

Forms &grIz_StageCallbacks[gobj_id] before Ground_GetStageGObj(gobj_id), with no index guard. Non-NULL result: clears Ground x8_callback and xC_callback, registers grDisplay_801C5DB0 with GX arguments 3,0, conditionally copies callback3 to x1C_callback, calls on_init immediately if present, then registers gobj_proc at priority 4 if present. A missing callback3 preserves x1C_callback. This wrapper does not directly read callback1 or row flags; Ground internals are delegated. NULL result reports ID and returns NULL; otherwise returns the Ground_GetStageGObj result.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L228-L258

## grIzumi_801CCEA0

Does nothing if refl->image is NULL, but user data itself is unguarded. Otherwise calls ftDrawCommon_80081140 and Camera_8002A4AC(Camera_80030A50()) before separately checking a second camera lookup. A present source camera supplies near/far/fov/aspect and eye/interest with Y negated to destination. If HSD_CObjSetCurrent succeeds: sets erase color(255,255,255,1), erases with(1,0,0), calls HSD_LObjDeleteCurrentAll(0), Camera_800310A0(0), Camera_80031074(1), then writes gxlink_prios0x25 and invokes HSD_GObj_80390ED0 with3; sets Camera_80031074(0), mask0x70 and pass7; disables fog, mask0x80 and pass7; ends current camera. Whether SetCurrent succeeds or fails, calls lb_800122C8(image,0,0,1), computes MTXLightPerspective with0.49,-0.49,0.5,0.5, concatenates with the viewing matrix into texture_matrix, then calls ftDrawCommon_80081118. renderpass unused; foreign renderer/capture/state effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L741-L797

## grIzumi_801CD090

Walks from GET_JOBJ(gobj). For nodes with(flags&0x4020)==0, scans each DObj, each non-NULL MObj and its linked TObjs, returning the first exact imagedesc pointer match. A NULL image can match a NULL imagedesc. Mask0x4020 only skips this node material scan; mask0x1000 separately prevents child descent. Traverses child, then sibling, then climbs parents until an ancestor sibling exists or no parent remains. There is no saved starting-root boundary, so traversal can reach starting-node siblings and ancestor siblings. Returns NULL on exhaustion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L808-L850

## grIzumi_801CD220

Reads reflection user data from Ground.u.izumi.xC8 and TObj from xC4, copies texture_matrix to tobj->mtx, then calls grDisplay_801C5DB0 with unchanged arguments. No null guards. Initializer installs this renderer even when texture lookup returns NULL, after only reporting a warning.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L852-L859

## grIzumi_801CD278

Returns NULL for every enum_t input without reads, calls or writes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L861-L864

## grIzumi_801CD280

Calls lb_8000B1CC(jobj,NULL,&vec) and returns a->y>vec.y. Integer input b is unused. Equality and unordered comparisons return false. No pointer guards or persistent local writes; geometric transform and callback-consumer meanings require foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L866-L875

## grIzumi_801CD2D4

Calls GXGetTexBufferSize(80,60,4,0,0), then lbDvd_80017740(0,2001,4,4,(size+31)&~31,0,7,16,0). Stores no result. Local arithmetic aligns the computed size to32 for ordinary nonoverflowing values; preload identity/heap/score semantics are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L877-L881

## .data

Source declares callback/joint tables, camera descriptors, local parameter/reflection structs and a cached parameter pointer. Exact section membership, binary size, jump-table representation, literal order and padding require compiler/object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L41-L880

## .rodata

Source declares callback/joint tables, camera descriptors, local parameter/reflection structs and a cached parameter pointer. Exact section membership, binary size, jump-table representation, literal order and padding require compiler/object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L41-L880

## .sbss

Source declares callback/joint tables, camera descriptors, local parameter/reflection structs and a cached parameter pointer. Exact section membership, binary size, jump-table representation, literal order and padding require compiler/object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L41-L880

## .sdata

Source declares callback/joint tables, camera descriptors, local parameter/reflection structs and a cached parameter pointer. Exact section membership, binary size, jump-table representation, literal order and padding require compiler/object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L41-L880

## .sdata2

Source declares callback/joint tables, camera descriptors, local parameter/reflection structs and a cached parameter pointer. Exact section membership, binary size, jump-table representation, literal order and padding require compiler/object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L41-L880

## file

Registers Gr_Kind_Izumi and /GrIz.dat with eleven callback rows and three GrJoint triples. Initializes IDs0,1,3; row3 constructs two ID4 state-machine objects, a reflection camera/image path and auxiliary render objects. Local code provides five-state height control, mirrored-Y camera setup, texture pointer lookup and matrix transfer. Stage identity, physical render results and delegated engine semantics require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L41-L880

## Header and Read Receipts

The header declares all 40 functions and StageData. The owned inline at C799–806 only gates material scanning. Local structs at C41–73 specify parameters and reflection storage; physical compiler sections remain unresolved.

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.1-220.json)

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.1-240.json)

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.221-440.json)

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.241-480.json)

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.441-660.json)

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.481-720.json)

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.661-882.json)

[src/melee/gr/grizumi.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.c.721-882.json)

[src/melee/gr/grizumi.h canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grizumi/pages/src__melee__gr__grizumi.h.1-56.json)

The platform factory invokes its process before the caller assigns xDC. Its initial state is0 or3, which avoids reading xDC on that immediate call. The reflection destructor callback is HSD_Free for user data; image lifetime remains a separate owner question.
