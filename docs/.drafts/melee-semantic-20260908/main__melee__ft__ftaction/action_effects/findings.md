# Action Effects Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Started 2026-09-08T14:33:02.411Z. Completed 2026-09-08T14:36:43.460123+00:00. Start is the first exact read receipt. Source lines 574–976 were read completely in canonical and rendered form. Supplemental table and declaration reads cover 1–120 and 145–269. Headers belong to the dispatch sibling.

## Command Behavior

Every function has signature void with Fighter_GObj* gobj and CommandInfo* cmd. All 32 parameter entities have empty fact inventories; their roles are recorded separately in coverage.json. NEXT_CMD and SKIP_CMD advance cmd.u directly, as verified in lb/inlines.h lines 8–19.

### ftAction_80071B50

Reads sound_effect behavior and advances once. For 0–6 reads SFX ID, advances, reads volume/pan and calls respectively ft_PlaySFX, ft_80088478, ft_800881D8, ft_80088510, ft_800885A8, ft_80088640 or ft_80088328. For 10–15 advances once and calls respectively ft_80088828, ft_80088770, ft_80088884, ft_800888E0, ft_8008893C or ft_800887CC. Common final advancement makes recognized families consume three words; all other behaviors consume two with no audio call.

Inherited alias: ftAction_SoundEffect. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L574-L658

### ftAction_80071CA4

Skips three command elements; gobj and payload are unused. Paired with 80071B50 in alternate table slot 7.

Inherited alias: ftAction_SkipSFXCommand. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L660-L663

### ftAction_80071CCC

Gets fp.ft_data.x4C_sfx.smash. If non-null calls ft_800889F4(fp,smash). Both branches advance the cursor once. No command payload is read.

Inherited alias: ftAction_PlaySmashSFX. Inherited alias unresolved pending callee review. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L665-L676

### ftAction_80071D30

Skips one command element, ignoring gobj and payload. Alternate table slot 8 replaces the smash-SFX handler 80071CCC, establishing a specific skip role beyond generic no-op.

Inherited alias: none. New proposed alias ftAction_SkipSmashSFX. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L678-L681

### ftAction_80071D40

Passes set_dobj_flags.idx and value with gobj to ftParts_80074B0C, then advances once. Model mutation is delegated.

Inherited alias: ftAction_SetDObjFlags. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L683-L688

### ftAction_80071D94

Calls ftParts_80074A8C(gobj), then advances once. No payload field is read.

Inherited alias: ftAction_RestoreModelParts. Inherited alias unresolved pending callee review. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L690-L694

### ftAction_80071DCC

Calls ftParts_80074ACC(gobj), then advances once. No payload field is read.

Inherited alias: ftAction_ClearModelPartSelections. Inherited alias unresolved pending callee review. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L696-L700

### ftAction_80071E04

Selects fp.xDF4 at set_throw_hitbox_0.idx and calls ftColl_8007ABD0 with damage and gobj. Advances, calls ftColl_8007AC9C with second-word unk0, writes x24/x28, advances, writes x2C/element/sfx_severity/sfx_kind from the third word and advances. No local bounds or eligibility guard.

Inherited alias: ftAction_SetThrowHitbox. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L702-L719

### ftAction_80071F0C

Skips three command elements without accessing fighter or payload. Alternate slot 24 replaces the throw-hitbox setup handler.

Inherited alias: ftAction_SkipSetThrowHitbox. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L721-L724

### ftAction_80071F34

Calls ftCommon_8007F5CC(gobj,unk27.value) then advances once. Held-item semantics and callbacks require callee review; none is invoked directly here.

Inherited alias: ftAction_SetItemVisibility. Inherited alias unresolved pending callee review. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L726-L731

### ftAction_80071F78

Copies set_article_vis.value to Fighter.x221E_b4, then advances once. No toggle or local condition.

Inherited alias: ftAction_SetArticleVisibility. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L733-L738

### ftAction_80071FA0

Copies set_fighter_vis.value to Fighter.x221E_b5, then advances once. No toggle or local condition.

Inherited alias: ftAction_SetFighterVisibility. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L740-L745

### ftAction_80071FC8

Reads volume/panning/behavior/random_range then advances and calls HSD_Randi. Cases 0–5 select one of six subsequent SFX ID elements and advance a total of seven elements including header. Behaviors 0–6 use the same audio call mapping as 80071B50; other behavior values make no audio call. No default initializes sfx_id for random indices outside 0–5; such a result advances only twice and can pass an uninitialized ID for recognized playback behavior.

Inherited alias: ftAction_PseudoRandomSFX. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L747-L838

### ftAction_800722C8

Skips seven command elements without fighter, RNG or audio access. Alternate slot 28 replaces the pseudo-random SFX handler.

Inherited alias: ftAction_SkipPseudoRandomSFX. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L840-L843

### ftAction_80072320

Consumes four stage_sfx words before destination dispatch. pitch_select 0/1/2/3 selects direction 0/+1/-1/facing_dir. Calls ft_80087D0C on the scripted ID; passes its result, direction, gobj, behavior, fixed 127/127 and three decoded parameters to lbAudioAx_800263E8, then lbAudioAx_800264E4. Destination 0 writes x2160 with channel 0; 1/2/3/4/5/6 write x214C/x2144/x2150/x2154/x2158/x2148 using player_id+x221F_b4 plus 0x36/0x1E/0x42/0x4E/0x5A/0x2A. Destinations 2/6 skip these calls when x2225_b6 is set except for GameWatch and Samus. Other destination values produce no handle write. Every audio call uses terminal -1. A pitch selector outside 0–3 has no initializing branch for direction.

Inherited alias: ftAction_StageSFX. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L845-L970

### ftAction_800726C0

Skips four command elements without fighter or payload access. Alternate slot 29 replaces the stage-SFX handler.

Inherited alias: ftAction_SkipStageSFX. Retain descriptive alias. Canonical symbol remains unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L972-L975

## Distinctions That Matter

The one-word no-op is specifically the alternate smash-SFX callback, paired at slot 8. Sound skips are not universally no-op events: the normal table has active handlers. Model and visibility handlers occur unchanged in both tables. Throw setup, pseudo-random sound and stage sound instead have dedicated skip partners.

The regular sound handler advances three elements only for recognized behavior families. Unsupported behaviors advance two. Random sound consumes seven only for selection indices 0–5; no fallback initializes sfx_id for another result. This is a source-level precondition, not evidence that malformed values occur in gameplay. Stage sound consumes four before deciding whether playback is suppressed. Its direction selector has no default initializer, but field-domain reachability needs shared-type review.

No callback is invoked indirectly inside these bodies. Direct subsystem calls may perform callbacks, which are not claimed without reading their implementations. The held-item and model restoration aliases therefore remain unresolved here. Article/fighter visibility aliases are grounded in canonical command-arm names; the boolean polarity is not inferred. StageSFX is retained as the canonical command-arm-derived hypothesis and does not prove a stage/environment mechanic.

## Fact Decisions and Limits

95 facts reviewed: {'unresolved': 51, 'retain': 41, 'supersede': 3}. Valid locally grounded facts are retained without rewriting. Three existing facts are superseded: two generic no-op descriptions gain the precise smash-event pairing, and stage-sound purpose gains its suppression guards. One new inferred name is proposed.

External caller and callee extensions remain explicit unresolved decisions rather than unsupported retain judgments. Per-fact IDs, updated_at versions, values and evidence are in fact-dispositions.json. Shared type/layout claims remain family followups. No source, Git, UI or shared KB mutation occurred.

Dry-run accepted four facts with zero rejections. No proposal was applied.

Independent-review ledger repair: packed operand widths and malformed random-selection outcomes must not be inferred from destination types. The final fact-dispositions.json supersedes any broader narrative here for the eight deferred retained claims. Consolidated final counts: 327 retain, 48 supersede, 88 unresolved; 49-write proposal unchanged.
