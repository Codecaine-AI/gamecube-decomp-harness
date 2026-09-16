## All-Star intro presentation

This unit constructs, updates, renders and requests completion of the presentation identified by `IrAls` and `ScItrAllstar_scene_data`. Its canonical identity is All-Star, not Classic. The descriptive function names in the rendered view remain hypotheses.

### Entry and retained state
`gm_Scene_IntroAllstar_OnEnter` clears the completion field and counter, copies a two-int payload, initializes prerequisite subsystems, and retains an archive handle and scene descriptor. The payload fields subsequently select character and costume. Entry constructs camera, lighting, model, fog and demo-fighter objects, then calls `lbAudioAx_80023F28(0x2D)`. There are no local allocation-failure or payload-null checks. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.c#L230-L267)

`fn_80187714` runs ten unconditional subsystem calls in source order, including camera argument 6, Ground argument 64, dummy-stage selection and effect argument 0. These numerical arguments should not acquire stronger semantics solely from rendered names. [Initializer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.c#L200-L212)

### Model and fighter coordination
`fn_801874FC` constructs the first archived model, registers rendering and `fn_80186EFC`, attaches animation index 0, evaluates frame 0, moves nodes 0x3A and 0x3B to Z=10000, and retains nodes 5 and 6. The animation helper independently permits missing joint, material and shape descriptor arrays. The large Z displacement suggests hiding authored subtrees, but their visual identity is not established. [Constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.c#L172-L192) [Animation helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L3855-L3863)

`fn_801873F0` resets demo allocation and players, configures slot 0 from the retained payload, passes numeric argument 6 to `Player_80036F34`, and returns the process registering `fn_80186F6C` at priority 0x16. The transform callback indexes a 28-entry table without a local bounds check. It takes node 5's translation, subtracts 7 from X, adds character-specific offsets, and applies the table scale. Optional logical entity 1 receives the primary scale and positional offset (+3,+4,-5). Only the secondary entity is null-guarded; identifying it specifically as an Ice Climbers partner requires additional evidence. [Table and fighter setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.c#L60-L155)

### Timing and rendering
Every `fn_80186EFC` invocation requests frame 0 on retained node 6 and evaluates the callback model. A counter below 140 increments without changing completion; a counter already at least 140 sets completion to 1. Starting from zero, completion therefore occurs on invocation 141, not on the increment reaching 140. Scheduling and wall-clock duration are not proved here. [Timer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.c#L44-L58)

`fn_80187494` ignores its integer parameter. Failed camera activation skips all subsequent rendering and finalization. Success invokes the common camera routine, writes priority mask 0x801, dispatches mask 7, and ends the current camera. Canonical dispatcher code confirms GX-link groups 0 and 11 and pass indices 0, 1 and 2; the priority field is not restored. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.c#L160-L170) [Dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L158-L183)

### Completion and evidence boundaries
`gm_Scene_IntroAllstar_OnFrame` does nothing while completion is zero. Otherwise it passes the retained archive to `lbArchive_80016EFC`, calls `lbAudioAx_800236DC`, and requests scene control through `gm_801A4B60`. It neither clears completion nor nulls retained pointers. Safe cessation of callbacks and destruction of descriptor-dependent objects therefore rely on external scene/resource lifetimes; this unit does not prove their ordering or idempotence. [Completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.c#L217-L224)

The header retains placeholder declarations for two helpers and the entry argument despite concrete definitions in the C file. No compiled artifacts were supplied, so source globals and constants are not assigned to compiled sections or layouts. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_186E.h#L8-L15)

Status: synthesized; independent review and live promotion pending.
