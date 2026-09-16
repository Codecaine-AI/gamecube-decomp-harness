# Grtclink Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files fully read in canonical and rendered form.

## grTCLink_8021FF44

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L53-L53

## grTCLink_8021FF48

Calls Ground_InitTargetStage with grTCLink_8021FFE8. No local state or guard; framework sequencing is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L55-L58

## grTclink_UnkStage0_OnLoad

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L60-L60

## grTclink_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once. Generator behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L62-L65

## grTCLink_8021FFE0

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L67-L70

## grTCLink_8021FFE8

Forms &grTCLink_StageCallbacks[id] before querying Ground_GetStageGObj(id). If non-null, passes the GObj and row to Ground_SetupStageCallbacks; otherwise reports the ID with OSReport. Returns the lookup result. There is no local range check on id or allocation performed explicitly by this wrapper.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L72-L86

## grTCLink_802200D0

Obtains Ground user data from gobj and passes gobj, gp->map_id and 0 to grAnime_801C8138. No local pointer checks. Animation setup internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L88-L92

## grTCLink_802200FC

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L94-L97

## grTCLink_80220104

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L99-L99

## grTCLink_80220108

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L101-L101

## grTCLink_8022010C

Passes gobj once to Ground_JObjInline1. Inline helper behavior requires the shared header.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L103-L106

## grTCLink_8022015C

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L108-L111

## grTCLink_80220164

Calls lb_800115F4() followed by Ground_801C2FE0(gobj), unconditionally and in that order. No local retained state. Wind, timed-entry and collision effects belong to the callees.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L113-L117

## grTCLink_80220198

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L119-L119

## grTCLink_8022019C

Passes gobj once to Ground_JObjInline1. Inline helper behavior requires the shared header.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L121-L124

## grTCLink_802201EC

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L126-L129

## grTCLink_802201F4

Passes gobj once to Ground_801C2FE0 and does not return its result. No local guard or state. Collision behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L131-L134

## grTCLink_80220214

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L136-L136

## grTCLink_80220218

Returns NULL for every selector without reading it or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L138-L141

## grTCLink_80220220

Returns true without reading any of its three inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L143-L146

## .data

Source declares StageCallbacks[4], three populated rows plus a zero row, and StageData with Gr_Kind_TClink, /GrTCl.dat, callbacks and flag bit0. Row2 has bits30/31; rows0/1 have zero flags. Field semantics and exact compiler-section membership require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L12-L51

## file

Registers Gr_Kind_TClink and /GrTCl.dat, supplies an ID-indexed setup callback to Ground_InitTargetStage and defines three populated callback rows. Setup retrieves a GObj and delegates callback installation; lifecycle and row functions are local stubs or shared-helper calls. Character identity, mode usage, callback-field meanings and delegated engine effects require family evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtclink.c#L12-L146
