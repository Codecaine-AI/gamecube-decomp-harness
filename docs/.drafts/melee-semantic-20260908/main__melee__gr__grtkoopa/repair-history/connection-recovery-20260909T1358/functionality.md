# Grtkoopa Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files fully read in canonical and rendered form.

## grTKoopa_80221648

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L79-L79

## grTKoopa_8022164C

Calls Ground_InitTargetStage(grTKoopa_802216EC) once; shared initialization sequencing is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L81-L84

## grTkoopa_UnkStage0_OnLoad

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L85-L85

## grTkoopa_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once, without inspecting its result; generator behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L87-L90

## grTKoopa_802216E4

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L92-L95

## grTKoopa_802216EC

Forms &grTKp_StageCallbacks[gobj_id] before calling Ground_GetStageGObj(gobj_id). Non-null result is passed to Ground_SetupStageCallbacks with the row; null causes OSReport. Returns the lookup result. No local index guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L97-L111

## grTKoopa_802217D4

Reads gobj->user_data as Ground and calls grAnime_801C8138(gobj,gp->map_id,0). No local pointer guards; animation internals delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L113-L117

## grTKoopa_80221800

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L119-L122

## grTKoopa_80221808

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L124-L124

## grTKoopa_8022180C

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L125-L125

## grTKoopa_80221810

Calls Ground_JObjInline1(gobj) once. Shared inline behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L127-L130

## grTKoopa_80221860

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L132-L135

## grTKoopa_80221868

Calls lb_800115F4() then Ground_801C2FE0(gobj) unconditionally in that order; timed-entry, wind and collision behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L137-L141

## grTKoopa_8022189C

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L143-L143

## grTKoopa_802218A0

Calls Ground_JObjInline1(gobj) once. Shared inline behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L145-L148

## grTKoopa_802218F0

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L150-L153

## grTKoopa_802218F8

Calls Ground_801C2FE0(arg0) once and does not return its result; collision internals delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L155-L158

## grTKoopa_80221918

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L160-L160

## grTKoopa_8022191C

Returns NULL for every selector without reading it or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L162-L165

## grTKoopa_80221924

Returns true without reading any of its three inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L167-L170

## .data

Source declares StageCallbacks[4], three populated rows plus a zero row, and StageData with Gr_Kind_TKoopa, /GrTKp.dat, callbacks and flag bit0. Row2 has bits30/31; rows0/1 have zero flags. Field semantics and exact compiler-section membership require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L38-L77

## file

Registers Gr_Kind_TKoopa and /GrTKp.dat, supplies an ID-indexed setup callback to Ground_InitTargetStage and defines three populated callback rows. Setup retrieves a GObj and delegates callback installation; lifecycle and row functions are local stubs or shared-helper calls. Character identity, mode usage, callback-field meanings and delegated engine effects require family evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkoopa.c#L38-L170
