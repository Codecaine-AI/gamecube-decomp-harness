# Grtmewtwo Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files fully read in canonical and rendered form.

## grTMewtwo_802221D8

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L99-L99

## grTMewtwo_802221DC

Caches Ground_GetYakumonoParam(), clears stage_info.unk8C.b4 and sets b5. Calls grTMewtwo_80222284 for indices 0,1,2, ignoring results, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. Shared effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L101-L113

## grTmewtwo_UnkStage0_OnLoad

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L115-L115

## grTmewtwo_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once, ignoring its result. Generator behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L117-L120

## grTMewtwo_8022227C

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L122-L125

## grTMewtwo_80222284

Forms &grTMewtwo_StageCallbacks[index] before Ground_GetStageGObj(index). Non-null result is passed to Ground_SetupStageCallbacks with the row; null causes OSReport. Returns lookup result. No local index guard; local callers use0,1,2.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L127-L141

## grTMewtwo_8022236C

Obtains Ground through GET_GROUND and calls grAnime_801C8138(gobj,gp->map_id,0). No local pointer guards. Macro and animation effects delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L143-L147

## grTMewtwo_80222398

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L149-L152

## grTMewtwo_802223A0

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L154-L154

## grTMewtwo_802223A4

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L156-L156

## grTMewtwo_802223A8

Calls Ground_JObjInline1(gobj) once. Inline effects delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L158-L161

## grTMewtwo_802223F8

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L163-L166

## grTMewtwo_80222400

Calls lb_800115F4() before Ground_801C2FE0(gobj), unconditionally. Shared dynamics/wind/collision meanings require foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L168-L172

## grTMewtwo_80222434

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L174-L174

## grTMewtwo_80222438

Calls Ground_JObjInline1(gobj) once. Inline effects delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L176-L179

## grTMewtwo_80222488

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L181-L184

## grTMewtwo_80222490

Calls Ground_801C2FE0(gobj) once and ignores its result.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L186-L189

## grTMewtwo_802224B0

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L191-L191

## grTMewtwo_802224B4

Returns NULL for arg0==-1. Otherwise mpJointFromLine selects inlineA0 only for joint0 or inlineA1 only for joint1; other results return NULL. Each inline calls mpLineGetKind: floor/ceiling/right-wall/left-wall select fields x0/x4/x8/xC for joint0 and x10/x14/x18/x1C for joint1. Unsupported kinds return NULL. No local yakumono_param null guard or other input validation. Field suffixes are not byte offsets: declaration order is x0,x4,xC,x8,x10,x14,x1C,x18. Returned descriptors may be null; contents and mp query internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L193-L223

## grTMewtwo_802225C8

Returns true without reading any of its three inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L240-L243

## .data

Source declares StageCallbacks[4], three populated rows plus a zero row, and StageData with Gr_Kind_TMewtwo, /GrTMt.dat, callbacks and flag bit0. Row2 has bits30/31; rows0/1 have zero flags. Field semantics and exact compiler-section membership require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L53-L97

## file

Registers Gr_Kind_TMewtwo and /GrTMt.dat, directly configures IDs0,1,2 and calls four Ground routines and defines three populated callback rows. Setup retrieves a GObj and delegates callback installation; lifecycle and row functions are local stubs or shared-helper calls. Character identity, mode usage, callback-field meanings and delegated engine effects require family evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L19-L243

## .sbss

Static yakumono_param points to an eight-DynamicsDesc-pointer structure declared in order x0,x4,xC,x8,x10,x14,x1C,x18. These names do not encode physical order. Initialization caches the pointer; exact .sbss membership requires object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmewtwo.c#L19-L51
