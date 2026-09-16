# Grtfalco Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files fully read in canonical and rendered form.

## grTFalco_802207F0

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L88-L88

## grTFalco_802207F4

Caches Ground_GetYakumonoParam(), clears stage_info.unk8C.b4 and sets b5. Calls setupStageCallbacks for IDs 0,1,2 in order, ignoring failures, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. Shared effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L90-L102

## grTfalco_UnkStage0_OnLoad

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L104-L104

## grTfalco_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once. Generator behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L106-L109

## grTFalco_80220894

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L111-L114

## setupStageCallbacks

Forms &grTFc_803E8918[gobj_id] before Ground_GetStageGObj(gobj_id). On non-null result calls Ground_SetupStageCallbacks; otherwise reports ID. Returns the result. No local index guard. Declaration uses HSD_GObj* while definition uses Ground_GObj*; shared typedef equivalence is not re-established here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L116-L130

## stageGObj0_OnInit

Obtains Ground user data and calls grAnime_801C8138(gobj,gp->map_id,0), without local pointer checks. Animation semantics are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L132-L136

## stageGObj0_Callback1

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L138-L141

## stageGObj0_GObjProc

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L143-L143

## stageGObj0_Callback3

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L145-L145

## stageGObj2_OnInit

Calls Ground_JObjInline1(gobj) once. Shared inline body is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L147-L150

## stageGObj2_Callback1

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L152-L155

## stageGObj2_GObjProc

Calls lb_800115F4() before Ground_801C2FE0(arg0), unconditionally. Shared wind/dynamics/collision semantics need foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L157-L161

## stageGObj2_Callback3

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L163-L163

## stageGObj1_OnInit

Calls Ground_JObjInline1(gobj) once. Shared inline body is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L165-L168

## stageGObj1_Callback1

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L170-L173

## stageGObj1_GObjProc

Calls Ground_801C2FE0(gobj) once and ignores its result.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L175-L178

## stageGObj1_Callback3

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L180-L180

## grTFalco_80220ACC

Returns NULL immediately for arg0==-1. Otherwise queries mpJointFromLine and proceeds only when its result is 0. Queries mpLineGetKind and returns cached unk_0 for CollLine_Floor, unk_4 for Ceiling, unk_8 for RightWall, unk_C for LeftWall; unknown kinds return NULL. No local yakumono_param null guard or validity check for other input values. Returned slots may themselves be null; actual DynamicsDesc contents and mp query behavior are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L182-L211

## grTFalco_80220B78

Returns true without reading any of its three inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L213-L216

## .data

Source declares StageCallbacks[4], three populated rows plus a zero row, and StageData with Gr_Kind_TFalco, /GrTFc.dat, callbacks and flag bit0. Row2 has bits30/31; rows0/1 have zero flags. Field semantics and exact compiler-section membership require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L38-L77

## file

Registers Gr_Kind_TFalco and /GrTFc.dat, directly configures IDs0,1,2 and calls four Ground routines and defines three populated callback rows. Setup retrieves a GObj and delegates callback installation; lifecycle and row functions are local stubs or shared-helper calls. Character identity, mode usage, callback-field meanings and delegated engine effects require family evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L38-L216

## .sbss

Static yakumono_param points to a four-slot UNK_T structure. Initialization caches Ground_GetYakumonoParam; lookup consumes those slots as DynamicsDesc pointers. Exact compiler .sbss membership requires object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfalco.c#L79-L102
