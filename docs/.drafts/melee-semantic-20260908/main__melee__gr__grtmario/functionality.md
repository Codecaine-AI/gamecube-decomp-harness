# Grtmario Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files fully read in canonical and rendered form.

## grTMario_8021F840

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L84-L84

## grTMario_8021F844

Calls Ground_InitTargetStage with grTMario_8021F8E4. Framework sequencing is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L86-L89

## grTmario_UnkStage0_OnLoad

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L91-L91

## grTmario_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once; generator behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L93-L96

## grTMario_8021F8DC

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L98-L101

## grTMario_8021F8E4

Forms &grTMr_StageCallbacks[arg0] before Ground_GetStageGObj(arg0). If non-null, delegates setup with that row; otherwise reports the ID. Returns lookup result. No local index bounds guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L103-L117

## grTMario_8021F9CC

Reads gobj->user_data as Ground and calls grAnime_801C8138(gobj,gp->map_id,0). No pointer guards; animation behavior delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L119-L123

## grTMario_8021F9F8

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L125-L128

## grTMario_8021FA00

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L130-L130

## grTMario_8021FA04

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L132-L132

## lbl_8021FA08

Calls ftCo_800C07F8(gobj,6,lbl_8021FB50). Registry, dispatch and selector semantics are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L134-L137

## grTMario_8021FA34

Calls Ground_JObjInline1(gobj), then Ground_801C10B8(gobj,lbl_8021FA08). Scheduling and inline-body effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L139-L143

## grTMario_8021FA94

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L145-L148

## grTMario_8021FA9C

Calls lb_800115F4() before Ground_801C2FE0(gobj), unconditionally. Wind, timed-entry and collision effects require foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L150-L154

## grTMario_8021FAD0

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L156-L156

## grTMario_8021FAD4

Calls Ground_JObjInline1(gobj) once; shared inline effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L158-L161

## grTMario_8021FB24

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L163-L166

## grTMario_8021FB2C

Calls Ground_801C2FE0(gobj) once and ignores its result.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L168-L171

## grTMario_8021FB4C

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L173-L173

## lbl_8021FB50

Ignores first argument. Computes threshold=-120.0f*Ground_801C0498(), fills current through ftLib_80086644 and previous through ftLib_80086684. Only if current.y<threshold and previous.y>threshold, computes ftLib_80086B80(gobj)/10.0f, sets local current.y to threshold, calls grTMario_8021FBE8 and then Ground_801C53EC(0x77A10). X/Z remain from current; no segment-plane interpolation occurs. Equality, upward crossing or remaining below does not trigger. Returns 0 on both paths. Accessor and event semantics are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L175-L193

## grTMario_8021FBE8

Calls grLib_801C96F8(0x7530,0x1E,vec). If non-null, multiplies existing appsrt scale.x/y/z by arg8. appsrt has no local null guard; multiplier is not clamped. A null generator skips scaling but does not prove the delegated call had no effects.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L195-L207

## grTMario_8021FC50

Returns NULL for every selector without reading it or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L209-L212

## grTMario_8021FC58

Returns true without reading any of its three inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L214-L217

## .data

Source declares StageCallbacks[4], three populated rows plus a zero row, and StageData with Gr_Kind_TMario, /GrTMr.dat, callbacks and flag bit0. Row2 has bits30/31; rows0/1 have zero flags. Field semantics and exact compiler-section membership require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L43-L82

## file

Registers Gr_Kind_TMario and /GrTMr.dat, supplies an ID-indexed setup callback to Ground_InitTargetStage and defines three populated callback rows. Setup retrieves a GObj and delegates callback installation; lifecycle and row functions are local stubs or shared-helper calls. Mario identity, mode usage, callback-field meanings and delegated engine effects require family evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L43-L217

## .sdata2

The source uses -120.0f and 10.0f in threshold and scale calculations. Exact pooled literals, size and compiler section placement need object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L175-L207

Crossing changes only the local vector. The Ground_801C53EC call still occurs after a null generator result. Negative and zero scaling factors are not rejected.

Lead correction: the inherited grTMario_OnStart alias differs from canonical grTmario_UnkStage0_OnStart. Its disposition is unresolved; the redundant-name clear was removed. Final proposal contains86 fact writes and no name writes.
