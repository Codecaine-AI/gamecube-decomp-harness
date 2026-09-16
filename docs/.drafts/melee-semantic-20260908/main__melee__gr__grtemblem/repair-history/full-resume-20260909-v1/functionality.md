# Grtemblem Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files fully read in canonical and rendered form.

## grTRoy_802243F4

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L76-L76

## grTRoy_802243F8

Calls Ground_InitTargetStage(grTRoy_80224498) once; shared initialization sequencing is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L78-L81

## grTemblem_UnkStage0_OnLoad

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L83-L83

## grTemblem_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once, without inspecting its result; generator behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L85-L88

## grTRoy_80224490

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L90-L93

## grTRoy_80224498

Forms &grTFe_StageCallbacks[gobj_id] before calling Ground_GetStageGObj(gobj_id). Non-null result is passed to Ground_SetupStageCallbacks with the row; null causes OSReport. Returns the lookup result. No local index guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L95-L109

## grTRoy_80224580

Reads gobj->user_data as Ground and calls grAnime_801C8138(gobj,gp->map_id,0). No local pointer guards; animation internals delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L111-L115

## grTRoy_802245AC

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L117-L120

## grTRoy_802245B4

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L122-L122

## grTRoy_802245B8

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L124-L124

## grTRoy_802245BC

Calls Ground_JObjInline1(gobj) once. Shared inline behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L126-L129

## grTRoy_8022460C

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L131-L134

## grTRoy_80224614

Calls lb_800115F4() then Ground_801C2FE0(gobj) unconditionally in that order; timed-entry, wind and collision behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L136-L140

## grTRoy_80224648

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L142-L142

## grTRoy_8022464C

Calls Ground_JObjInline1(gobj) once. Shared inline behavior is delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L144-L147

## grTRoy_8022469C

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L149-L152

## grTRoy_802246A4

Calls Ground_801C2FE0(gobj) once and does not return its result; collision internals delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L154-L157

## grTRoy_802246C4

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L159-L159

## grTRoy_802246C8

Returns NULL for every selector without reading it or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L161-L164

## grTRoy_802246D0

Returns true without reading any of its three inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L166-L169

## .data

Source declares StageCallbacks[4], three populated rows plus a zero row, and StageData with Gr_Kind_TEmblem, /GrTFe.dat, callbacks and flag bit0. Row2 has bits30/31; rows0/1 have zero flags. Field semantics and exact compiler-section membership require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L38-L74

## file

Registers Gr_Kind_TEmblem and /GrTFe.dat, supplies an ID-indexed setup callback to Ground_InitTargetStage and defines three populated callback rows. Setup retrieves a GObj and delegates callback installation; lifecycle and row functions are local stubs or shared-helper calls. Character identity, mode usage, callback-field meanings and delegated engine effects require family evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtemblem.c#L38-L169

## Header and Read Receipts

The header declares `extern StageData grTFe_StageData` at line 6. Its include guard and forward include cover lines 1–8.

[src/melee/gr/grtemblem.c canonical and rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grtemblem/pages/src__melee__gr__grtemblem.c.1-170.json)

[src/melee/gr/grtemblem.h canonical and rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grtemblem/pages/src__melee__gr__grtemblem.h.1-9.json)

