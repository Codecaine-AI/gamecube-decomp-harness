# Shared Ground Subsystem

Ground owns selected-stage state, lifecycle dispatch, Ground object construction and registries, collision-joint coordination, stage markers, camera and blast bounds, fog and light setup, managed sound slots and shared stage counters. The review covers all 3542 owned lines in canonical and rendered views, 352 subjects, 892 original facts and 171 exact outgoing links.

## Construction and Shared Callback Consumers

Ground_GetStageGObj creates and registers a fresh object. Ground_GetMapGObj reads the registry. Primary allocations may return NULL, while get_jobj_inline failure loops forever. The custom-joint constructor does not register the object and initializes fewer Ground flags. Both use selected writes into an uncleared allocation.

StageCallbacks flags_b0 selects light data and flags_b1 selects fog data by archive map count. flags_b2 gates auxiliary camera construction. These consumers do not stop at an all-zero callback row. Ground_SetupStageCallbacks installs on_init, gobj_proc and callback3; named callback1 dispatch remains unresolved. Target setup scans markers 199 through 219 and counts nonnull item returns. Completion flag0x20 is raised only by decrement to exactly zero.

## Individual Functions

### Ground_801BFFAC

The function pointer is stored in `Ground_StageData.on_demo_init`. When the generic Ground descriptor is selected, `Ground_DemoInit` forwards its demo argument through that slot; the target discards the incoming value, performs no reads, writes, or calls, and produces no output beyond returning to the dispatcher. Provides the generic Ground stage descriptor with an intentionally inert demo-initialization callback, allowing the common demo dispatcher to invoke the lifecycle slot even though this descriptor requires no demo-specific setup. Has invariant no-op behavior for every demo argument: it contains no guards, lifecycle transitions, timers, callback chaining, or state mutation and returns immediately.

[Canonical lines 207-207](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L207-L207).

### Ground_801BFFB0

Calls grDatFiles_801C6288, then resets selected StageInfo fields and pointer arrays. Installs camera defaults and blast bounds of +/-99999; this is not a whole-structure clear, and fields not assigned here retain prior values.

[Canonical lines 209-270](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L209-L270).

### Ground_801C0378

Ignores its integer argument, calls ftCo_800C06C0, allocates 64 bytes, publishes the pointer in Ground_804D6950 and zeros all 64 bytes without checking allocation success. It does not free the previously stored allocation.

[Canonical lines 280-285](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L280-L285).

### Ground_801C0498

Retrieves the current stage parameter's Y scalar for stage-space scaling, returning the neutral scale 1.0 when no stage parameter block is available. This accessor has two guarded outcomes and performs no mutation: it returns the stored Y scalar when `stage_info.param` is non-null, or returns 1.0 when the parameter block is absent.

[Canonical lines 292-299](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L292-L299).

### Ground_801C0508

Read C1–480 both views completely, helper receipts in campaign pages.

[Canonical lines 319-323](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L319-L323).

### Ground_801C052C

Updates the first entry of the current stage's shared nine-color presentation palette, allowing stage-specific routines to replace that color while leaving the other eight entries unchanged. Performs an unconditional synchronous overwrite of the xB8 palette slot: it has no branch, timer, transition logic, or null guard, so the supplied color remains in the current GroundParam until another write replaces it.

[Canonical lines 325-329](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L325-L329).

### Ground_801C0544

Updates the `xC0` color entry in the active stage's shared `GroundParam` palette, allowing stage-specific modules to install presentation-color presets that are subsequently exposed to the interface subsystem. Performs an unconditional synchronous overwrite of the active stage palette's `xC0` entry. It has no branch, timer, transition logic, or null guard of its own, so the new color persists in shared stage parameters until another caller replaces it.

[Canonical lines 331-335](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L331-L335).

### Ground_801C055C

Sets the current stage's `GroundParam.xD0` color slot, allowing stage-specific code to replace one entry in the shared ground color palette used by presentation systems.

[Canonical lines 337-341](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L337-L341).

### Ground_801C0574

Performs an unconditional synchronous overwrite: it has no null guard, branch, timer, or transition logic, so callers must provide a valid color pointer and an initialized `stage_info.param`. The selected color persists in `GroundParam.xD8` until another caller overwrites that field or the stage parameters are replaced.

[Canonical lines 343-347](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L343-L347).

### Ground_801C058C

Sets one entry of the current stage's shared color palette by copying a caller-provided `GXColor` into `stage_info.param->xC4`. Performs an unconditional synchronous state update: each call immediately overwrites the xC4 color slot. It has no internal null check, guard, timer, branch, or transition logic, so stage-specific callers determine when palette changes occur and must call it only while `stage_info.param` is valid.

[Canonical lines 349-353](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L349-L353).

### Ground_801C05A4

Receives a `GXColor` pointer from stage-specific palette setup code, reads the pointed-to RGBA value, and overwrites `stage_info.param->xCC`. The paired accessor `Ground_801C0668` subsequently exposes the address of that same persistent color slot. Sets the `xCC` color slot in the current stage's shared `GroundParam`, allowing stage-specific code to install one component of the stage presentation palette. Performs an unconditional synchronous overwrite of the active stage's `xCC` color parameter. It has no null guard, branch, timer, or transition logic of its own; sequencing and palette selection are entirely controlled by its callers.

[Canonical lines 355-359](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L355-L359).

### Ground_801C05BC

Updates the `xD4` color entry in the active stage's shared `GroundParam`, serving as one member of a nine-function interface through which stage-specific code installs coordinated presentation-color presets. Per invocation, the function synchronously and unconditionally replaces the active stage's `xD4` color slot. It has no null guard, branch, timer, interpolation, or internal state transition; stage-sequence selection and any timed visual transition are controlled entirely by its callers.

[Canonical lines 361-365](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L361-L365).

### Ground_801C05D4

Receives a `GXColor` through its pointer parameter, reads the active `GroundParam` through `stage_info.param`, and overwrites `GroundParam.xBC` with the complete RGBA value. The paired getter `Ground_801C0690` later exposes the address of the same field. Updates the `xBC` color entry in the current stage's shared `GroundParam` palette, allowing stage-specific code to install that entry as part of a coordinated visual color preset. Performs an unconditional synchronous overwrite of the active stage's `xBC` color slot. It has no null check, branch, timer, interpolation, or internal state transition; sequencing and transition timing are controlled entirely by its callers.

[Canonical lines 367-371](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L367-L371).

### Ground_801C05EC

Receives a color selected or constructed by stage-specific code, reads the active parameter block from `stage_info.param`, and overwrites `GroundParam.xC8` with the pointed-to RGBA value. `Ground_801C06A4` is the corresponding accessor that exposes the stored slot by address. The setter itself is unconditional and branch-free: every invocation immediately overwrites `xC8`, with no null guard, timer, or internal state transition. Selection and guarding occur in its callers, and the resulting color persists in the shared stage parameters until a later palette update replaces it.

[Canonical lines 373-377](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L373-L377).

### Ground_801C0604

Read C1–480 both views completely, helper receipts in campaign pages.

[Canonical lines 379-383](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L379-L383).

### Ground_801C0618

Read C1–480 both views completely, helper receipts in campaign pages.

[Canonical lines 385-389](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L385-L389).

### Ground_801C062C

Reads the global `stage_info.param` pointer, treats the referenced object as the current stage's `GroundParam`, and exposes its `xD0` color by address; reads or writes through the returned pointer therefore operate directly on that stage parameter storage. Provides mutable access to the `GXColor` stored at `GroundParam.xD0` for the currently loaded stage.

[Canonical lines 391-395](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L391-L395).

### Ground_801C0640

Read C1–480 both views completely, helper receipts in campaign pages.

[Canonical lines 397-401](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L397-L401).

### Ground_801C0654

Reads the global `stage_info.param` pointer, treats the referenced object as `GroundParam`, derives the address of its `xC4` field, and returns that alias. The accessor performs no copy, allocation, validation, or mutation itself; subsequent reads or writes through the returned pointer operate on the current stage parameter object. Provides mutable access to the current stage's `GXColor` parameter stored in `GroundParam.xC4`, without requiring callers to access the global `stage_info` container directly.

[Canonical lines 403-407](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L403-L407).

### Ground_801C0668

Reads the global `stage_info.param` pointer, derives the address of its `GroundParam.xCC` member, and returns that address unchanged. The accessor performs no copy, validation, allocation, or mutation itself; reads or writes through the returned non-const pointer operate directly on the active stage parameter block. Provides mutable access to the `GXColor` stored at `GroundParam.xCC` for the active stage.

[Canonical lines 409-413](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L409-L413).

### Ground_801C067C

The function reads the global `stage_info.param` pointer, derives the address of its `xD4` member, and returns that address unchanged. Because the result aliases the stored `GXColor`, callers may read or modify the active stage parameter in place; the accessor itself performs no write. Provides direct access to the `xD4` color stored in the active stage's `GroundParam` block.

[Canonical lines 415-419](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L415-L419).

### Ground_801C0690

Reads the global `stage_info.param` pointer, treats the referenced object as `GroundParam`, derives the address of its `xBC` field, and returns that alias. The accessor performs no copy, allocation, validation, or mutation itself; subsequent reads or writes through the returned pointer operate directly on the active stage parameter object. Provides mutable access to the current stage's `GXColor` parameter stored at offset `0xBC` in `GroundParam`, shielding callers from direct access to the global `stage_info` container.

[Canonical lines 421-425](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L421-L425).

### Ground_801C06A4

Reads the global `stage_info.param` pointer, interprets the referenced object as `GroundParam`, derives the address of its `xC8` color field, and returns that alias to the caller. The function performs no copy, allocation, validation, or mutation itself; subsequent reads or writes through the returned pointer operate on the current stage parameter object. Provides callers with mutable access to the current stage's `GXColor` parameter stored at offset `0xC8` in `GroundParam`, avoiding direct access to the `stage_info` container.

[Canonical lines 427-431](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L427-L431).

### Ground_801C06B8

Returns immediately when the selected GrKind has no stage-data descriptor. With a descriptor, it queues the primary resource only when `data1` is non-null. It then always evaluates the GrKind switch: Izumi and Pokémon Stadium invoke their respective supplemental routines, while every other kind returns without supplemental work. The function has no timer, wait loop, or persistent local state.

[Canonical lines 433-451](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L433-L451).

### Ground_801C0754

Performs the Ground subsystem's initial setup for a selected stage: it resets shared stage state, selects the stage implementation descriptor, loads the stage's initial DAT resources, initializes stage-dependent parameters, installs the descriptor's runtime callbacks, and invokes the final common setup step.

[Canonical lines 453-466](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L453-L466).

### Ground_801C0800

Receives a `StageIdPair` built from the active stage selection and uses its `grkind` to select a `StageData` descriptor. Values and resource pointers already stored in `stage_info` flow into shared Ground parameter setters, item registration, random-item article script slots, the stage particle bank, and the map-collision library. After common Ground setup, control flows through the selected descriptor's `on_init` callback. Initializes the selected stage's runtime ground environment by applying loaded stage parameters, registering stage item and article scripts, loading particle and collision resources, running common Ground setup, and finally invoking the selected stage implementation's `on_init` callback. Performs one ordered initialization phase without validating the pair or selected stage descriptor. Parameter installation is unconditional; item and article tables are traversed only when present and stop at null sentinels; the particle bank is loaded only when both particle and texture resources are present. Collision loading and common Ground setup always follow, and the selected stage's `on_init` callback runs last.

[Canonical lines 468-510](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L468-L510).

### Ground_801C0A70

Receives a caller-owned Vec3, reads the current stage kind, random-number state, player-slot occupancy and position, and the effective upper blast boundary. Its preferred path transforms a selected player's position into a drop point by setting y to the upper blast line minus 5 and adding a random x offset from -50 through 49. Its fallback delegates the same output vector to Stage_80224FDC. Ground_801C0C2C then copies a successful result into BobOmbRain.x8_vec and passes the descriptor to it_8026BE84.

[Canonical lines 512-575](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L512-L575).

### Ground_801C0C2C

Each proximity-search flag behaves as a one-shot request once an eligible player-1 fighter is available: range `0x99..0xB2` uses the first bounds pair, callback, and result field, while range `0xBD..0xC6` uses the second set. A successful candidate stores its index; exhaustion stores `-1`; the processed request flag is then cleared. If the fighter is absent or in the excluded condition, the flags remain pending. The Bob-omb path is active only while the match-rule predicate is true. It starts after frame `0x4B0` and requires more than `0x1E` frames since the previous attempt; the current frame is latched before position selection, so even a failed position lookup consumes that interval.

[Canonical lines 584-686](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L584-L686).

### Ground_801C0FB8

Starts the selected ground implementation's active runtime phase: it invokes the stage-specific start hook, consumes deferred Ground callbacks, and installs the common recurring stage process. Startup is ordered as a one-way lifecycle transition: first run the selected stage's `on_start` hook, then execute and free every deferred callback node until the queue is empty, explicitly set the global queue head to NULL, and finally schedule the common Ground process on a new stage-class GObj. Deferred nodes are consumed exactly once during this transition.

[Canonical lines 693-710](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L693-L710).

### Ground_801C10B8

Takes a GObj and `HSD_GObjEvent`, allocates a node, copies the current `stage_info.x6A4` head into its next field, stores both inputs, and publishes the node as the new head. During Ground startup, `Ground_801C0FB8` reads that list after the stage-specific `on_start` call, passes each saved GObj to its saved callback, frees the node, and finally clears the global head. Queues a one-shot GObj callback for deferred execution after the selected stage's `on_start` hook, allowing stage-object initialization routines to postpone final setup until the stage start phase. Successful registrations are pushed onto the front of the pending list, so multiple callbacks execute in last-in-first-out order during the next Ground start phase. Each callback is one-shot because its node is freed immediately after invocation and the list head is reset to NULL after the drain. Allocation failure is fatal: the function reports an assertion and panics rather than dropping the callback.

[Canonical lines 717-734](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L717-L734).

### Ground_801C1154

Parameterless no-op with no reads, writes or calls.

[Canonical lines 736-736](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L736-L736).

### Ground_801C1158

Reads `stage_info.grkind` as its selector. For Pokémon Stadium it retrieves `stage_info.map_gobjs[1]` through `Ground_GetMapGObj` and passes that Ground object to the Stadium display updater; for Corneria or Venom it invokes a shared stage routine without arguments. It writes no common Ground state directly, with all outputs occurring through the selected callee.

[Canonical lines 738-751](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L738-L751).

### Ground_801C11AC

Receives an `HSD_GObj*`, reads its `hsd_obj` pointer as the destination JObj, expands the constant 1.0 into all three components of a local `Vec3`, and passes that vector to `HSD_JObjSetScale`, replacing the destination's local scale.

[Canonical lines 753-763](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L753-L763).

### Ground_801C126C

Receives an HSD_Joint hierarchy node and a caller-owned traversal counter. Each visited node decrements the shared counter; if it becomes negative, that node is returned. Otherwise the function searches the node's child subtree before its next-sibling subtree and propagates the first non-null result. Ground_801C13D0 obtains the root from a stage archive entry, initializes the counter from its requested index, and consumes the returned descriptor through HSD_JObjLoadJoint. Selects a joint descriptor by zero-based traversal index from an archive entry's child/next hierarchy so Ground_801C13D0 can instantiate the selected descriptor as an HSD_JObj.

[Canonical lines 765-783](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L765-L783).

### Ground_801C13D0

Instantiates a runtime HSD_JObj hierarchy from a selected joint descriptor in a loaded stage archive entry, optionally selecting a nested descriptor by traversal depth before loading it. Returns NULL without loading a model when no retained archive contains the requested map entry. With a qualifying archive, depth zero selects the entry's root joint; any nonzero depth invokes a pre-order, child-before-next traversal with a mutable counter. The selected descriptor is then loaded unconditionally, so exhaustion of the hierarchy is not handled by an additional guard in this routine.

[Canonical lines 785-801](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L785-L801).

### Ground_801C1A20

Creates a GObj and Ground payload from a supplied joint descriptor. GObj failure returns NULL; Ground allocation failure destroys the GObj and returns NULL. Initializes selected payload fields and eight sound slots, loads and binds the supplied hierarchy, adds a stage-scaled dummy root and schedules processes at priorities 1 and 4. It does not register map_gobjs and initializes fewer flag fields than Ground_GetStageGObj.

[Canonical lines 939-987](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L939-L987).

### Ground_801C1CD0

On every invocation, JObj animation, material-overlay processing, and the `mpColl_804D64AC` increment occur unconditionally and in that order. The `x8_callback` executes afterward only when installed; its absence does not suppress the preceding update stages. Newly constructed Ground objects begin with `x8_callback` null, but stage-specific setup may install it after this process is registered.

[Canonical lines 989-1000](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L989-L1000).

### Ground_801C1D38

Receives a Ground GObj from the HSD process scheduler, reads that GObj's `user_data` as a `Ground*`, reads `Ground.xC_callback`, and, when non-null, passes the original GObj unchanged to that callback. The dispatcher itself writes no state. Serves as the priority-4 process adapter for a Ground GObj, invoking the optional callback stored in that object's Ground payload. On each scheduled invocation, the function calls `xC_callback` exactly once when that slot is non-null and otherwise performs no action. Ground object construction initializes the slot to null, so this process starts disabled and becomes behaviorally active only if other Ground logic installs a callback; the dispatcher performs no transition, timer update, or callback replacement itself.

[Canonical lines 1002-1008](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1002-L1008).

### Ground_801C1D6C

Enables one or more global stage-state flags while preserving every flag already set. The operation performs a monotonic flag transition: every supplied clear bit becomes set, supplied bits already set remain set, and all bits outside the mask remain unchanged. Passing zero is a no-op, and the function never clears stage state.

[Canonical lines 1010-1013](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1010-L1013).

### Ground_801C1D84

Returns zero while none of the `0x330` stage-status bits are active and returns their raw nonzero combination once one or more are active. The query itself does not transition state; the neighboring `Ground_801C1D6C` routine can latch stage flags by OR-ing a supplied mask into the same global word.

[Canonical lines 1015-1018](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1015-L1018).

### Ground_801C1D98

Provides a read-only Ground-subsystem query for stage flag bit 0x20, allowing game-mode code to test a stage-signaled condition without directly accessing `stage_info`. The accessor is stateless and read-only: it returns 0 while stage flag bit 0x20 is clear and 0x20 while that bit is set, without performing any transition or mutation.

[Canonical lines 1020-1023](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1020-L1023).

### Ground_801C1DAC

Reads bit 0x100 from the shared `stage_info.flags` word and returns the masked value unchanged. The shared flag word can be accumulated through `Ground_801C1D6C`, which ORs caller-supplied bits into it. Provides a read-only Ground-subsystem query for bit 0x100 of the current stage's shared flag word.

[Canonical lines 1025-1028](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1025-L1028).

### Ground_801C1DC0

Reads bit 0x80 from the shared `stage_info.flags` word and returns that masked value unchanged. Provides a read-only Ground-subsystem query for bit 0x80 of the current stage's shared flag word. The accessor is stateless and read-only: each call returns 0 while stage flag bit 0x80 is clear and 0x80 while it is set, with no mutation or internal transition.

[Canonical lines 1030-1033](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1030-L1033).

### Ground_801C1DD4

Returns stage_info.x6D0 unchanged. Ground_801C3D44 copies the retained primary proximity-query marker into this field when that marker is not -1; the accessor does not itself resolve a stage identity or calculate rewards.

[Canonical lines 1035-1038](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1035-L1038).

### Ground_801C1DE4

Provides a snapshot of Target Test progress by returning the number of targets currently remaining and the course's total target count through two output parameters.

[Canonical lines 1040-1044](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1040-L1044).

### Ground_801C1E00

Sets the global Ground flag that enables or suppresses application of a stage object's fog settings during rendering.

[Canonical lines 1046-1049](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1046-L1049).

### Ground_801C1E18

C1010–1054 OR stage flags, raw mask getters330/20/100/80, field outputs unchecked, set/get b2.

[Canonical lines 1051-1054](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1051-L1054).

### Ground_801C1E2C

Serves as the Ground subsystem's guarded fog-render callback: when the camera predicate permits stage fog and the active stage enables the corresponding stage flag, it applies the fog object attached to the supplied GObj to the active GX rendering state. Each invocation has three no-op outcomes: the camera predicate is true, the stage fog-enable flag is false, or the attached object is null. Only when the camera predicate is false, `stage_info.unk8C.b2` is true, and the payload is non-null does the routine apply fog state. It retains no local state and does not mutate the GObj or stage descriptor.

[Canonical lines 1056-1071](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1056-L1071).

### Ground_801C1E84

Returns stage_info.x12C unchanged. Ground_801C1E94 publishes the fog GObj there; this accessor performs no null check or payload extraction.

[Canonical lines 1073-1076](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1073-L1076).

### Ground_801C1E94

The helper scans the callback table for the current `stage_info.grkind` and returns the fog descriptor associated with the first entry whose fog flag is set. When a descriptor exists, it flows through `HSD_FogLoadDesc` into a new HSD_Fog attached to a newly created HSD_GObj. The object is registered with `Ground_801C1E2C` as its GX callback; `stage_info.param->y`, or 1.0 when no parameter block exists, multiplies both fog depth endpoints; the descriptor color flows to the camera background; and the GObj pointer is written to `stage_info.x12C` for later fog access. Initializes the current stage's renderable fog object from the first fog-enabled stage resource entry. It attaches the loaded HSD_Fog to a new HSD_GObj, registers the fog rendering callback, applies the stage fog-depth scale, initializes the camera background to the fog color, and retains the GObj in stage_info for later access. The routine has two resource-dependent outcomes. If no callback entry supplies a fog descriptor, it sets the camera background to black and creates no fog object. If a descriptor exists, it creates and registers a live fog GObj, scales the fog's start and end values by `stage_info.param->y` when that parameter block exists or by 1.0 otherwise, sets the background to the fog color, and records the live-object handle in `stage_info.x12C`. Later Ground routines treat a non-null `x12C` with an attached fog as the active fog state.

[Canonical lines 1108-1138](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1108-L1138).

### Ground_801C205C

Replaces the active stage asset's stored fog color with a supplied GXColor. It safely does nothing when the color argument, stage asset, or asset's HSD_Fog object is unavailable.

[Canonical lines 1150-1158](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1150-L1158).

### Ground_801C2090

Provides a null-safe query for the active stage fog color, copying it to caller-owned storage and reporting whether valid stage, output, and fog objects were available. Each invocation has two outcomes. If the active stage object, output pointer, and attached fog object are all non-null, the function snapshots the current fog color and returns `true`. If any prerequisite is missing, it returns `false`, leaves caller storage unchanged, and does not modify stage state.

[Canonical lines 1160-1170](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1160-L1170).

### Ground_801C20D0

C1140–1170 background uses livefog orblack; color setters/getters guard pointers, getter failure leaves output unchanged. C1172–1175 vertical tilt getter.

[Canonical lines 1172-1175](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1172-L1175).

### Ground_801C20E0

Mutates a nonempty null-terminated LightList array only if some entry has a matching override with at least one enabled switch. Then descriptors with flags&3 are removed by pointer compaction when their override is absent or all false, or have bits 4,8,0x400 updated from the three override switches. Other descriptor types remain unchanged. Returns the original array and does not free removed lights.

[Canonical lines 1231-1299](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1231-L1299).

### Ground_801C2374

The scale factor comes from `stage_info.param->y` through `Ground_801C0498`, with `1.0F` used when no stage parameter block exists. For each HSD_LObj, the function conditionally retrieves its effective position and interest into a temporary Vec3, multiplies all three components by that factor, and writes the scaled vector back to the same light before advancing to `next`. Rescales the spatial position and interest point of every light in an HSD_LObj chain by the current stage coordinate multiplier, preparing stage-provided lights for use in the scene-lighting setup. A null list head is a no-op. For each non-null node, an absent position or interest is skipped independently; each available vector is scaled and replaced in place. Traversal continues until the chain's null terminator, with no allocation or list-link changes required for vectors whose getters succeed.

[Canonical lines 1301-1325](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1301-L1325).

### Ground_801C247C

Retrieves an indexed HSD spline from the loaded stage archive that owns a requested map ID, providing stage-specific code with reusable motion-path data. The resolved archive is mandatory and triggers an assertion if absent. If the archive's stage-data pointer is non-null and `spline_index` is less than its spline count, the indexed spline pointer is returned; otherwise the function returns null. It performs no state mutation. The implementation does not independently reject a negative spline index.

[Canonical lines 1327-1336](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1327-L1336).

### Ground_801C24F8

Resolves the background-music ID for a requested stage. It finds that stage's parameter record, interprets a caller-supplied selection mask to choose the appropriate default or alternate BGM field, falls back to the corresponding default when no alternate is defined, and reports whether a valid alternate track was selected.

[Canonical lines 1342-1481](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1342-L1481).

### Ground_801C28AC

Exposes the Ground subsystem's stage-music resolver to other translation units: it delegates stage-kind and selection-mask processing to Ground_801C24F8, which resolves a stage's default or alternate BGM, writes the selected BGM ID through the output pointer, and reports whether an alternate track was selected. The wrapper has no independent guard or state and always invokes the resolver once. In the delegated state machine, mask bit 0x4 requests policy-based choice: the matching StageParam's policy can force the default, choose the alternate with a fixed or configured probability, or require character, collectible, or game-progress unlock conditions; bit 0x40 forces the alternate side of eligible policies. Bits 0x10 and 0x20 choose one pair of BGM fields, while their absence chooses another pair. If the requested alternate is undefined, selection falls back to the corresponding default; successful alternate selection returns true, and some profiles also update `stage_info.unk8C.b0`. An unresolved stage/BGM asserts, while BGM value -2 is replaced by a character-dependent randomized track.

[Canonical lines 1483-1486](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1483-L1486).

### Ground_801C28CC

Finds the first StageParam row matching the supplied StKind and writes 35 signed-halfword products into caller-provided s32 output storage. Missing stage data reports configuration details and loops forever. Ground_801C0754 supplies &stage_info.xA0 as the output in the local setup path.

[Canonical lines 1505-1524](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1505-L1524).

### Ground_801C2AD8

Provides the item-spawning subsystem with direct access to the selected stage's persistent 35-entry effective item-count table. The accessor is unconditional and stateless: it always returns the same live StageInfo array and performs no validation, transition, or mutation. The referenced contents are initialized for the selected StKind during stage setup and remain available for later item-spawner initialization.

[Canonical lines 1526-1529](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1526-L1529).

### Ground_801C2AE8

Returns immediately when it finds the first StageParam whose `stkind` matches the request. If no matching entry exists, it reports `not found stage param in DAT` and enters a non-returning infinite loop, treating a missing stage parameter as a fatal configuration error rather than supplying a fallback.

[Canonical lines 1531-1544](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1531-L1544).

### Ground_801C2BBC

`Ground_GetStageGObj` creates and initializes a Ground_GObj for `map_id`, then passes that pointer and `map_id` to this function. The function stores the pointer unchanged in `stage_info.map_gobjs[map_id]`; `Ground_GetMapGObj` later reads and returns the pointer from the same indexed registry. Registers a Ground game object in the global stage map-object registry under its stage-local map-object index, making the completed object available to later Ground and stage-specific code. Each call unconditionally replaces one `stage_info.map_gobjs` slot. The function performs no null check, bounds validation, duplicate-registration check, or preservation of the previous pointer. In the observed construction path, registration occurs only after successful initialization and process installation, while earlier failure returns leave the slot unpublished.

[Canonical lines 1551-1554](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1551-L1554).

### Ground_801C2BD4

Registers each distinct auxiliary HSD camera object created for a stage Ground component in a fixed-capacity stage-wide registry, allowing Ground display code to recognize auxiliary-camera render passes.

[Canonical lines 1556-1572](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1556-L1572).

### Ground_801C2C8C

C1546–1554 Ground_GetMapGObj is ACTUAL lookup, pairedstaticsetter, bothunchecked. C1556–1572 cameraregistry dedups includingNULL, firstfreeslot elseassert. C1574–1583 membership scans4 includesNULL. C1585–1593 positionJObj getters/settersunchecked.

[Canonical lines 1574-1583](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1574-L1583).

### Ground_801C2CF4

Returns an indexed stage JObj from the shared stage_info registry so stage-specific code can access and manipulate stage model joints. This is a read-only registry query: it does not mutate stage or JObj state, perform a transition, or validate the index. It returns the registry's current slot value, including NULL for an absent joint, leaving index validity and null handling to callers.

[Canonical lines 1585-1588](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1585-L1588).

### Ground_801C2D0C

Receives a slot index and an `HSD_JObj*` selected by stage-specific code, then writes the pointer unchanged to `stage_info.x280[index]`. The paired getter returns entries unchanged, while `Ground_801C2D24` resolves ordinary entries to world-space vectors and treats query IDs 8 and 9 as the pairwise centers of slots 4/5 and 6/7. Registers an HSD model joint in an indexed shared Ground reference slot so stage-specific code and common Ground coordinate queries can subsequently access that stage-position anchor.

[Canonical lines 1590-1593](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1590-L1593).

### Ground_801C2D24

A position ID selects an entry in `stage_info.x280`; when present, that HSD_JObj flows through `lb_8000B1CC` to write its global origin into the caller's Vec3. IDs 8 and 9 instead average the resolved pairs 4/5 and 6/7. Missing IDs 1–3 alias ID 0, missing IDs 5–7 alias ID 4, missing ID 0x7F prefers ID 0x94 shifted upward by 50 units and otherwise aliases ID 0, and missing ID 4 returns the current stage camera offset. Resolves a stage-position identifier into a world-space coordinate. It uses registered stage JObjs when available and supplies aliases or synthesized fallback positions for several reserved identifiers. The resolver is stateless but follows an ordered fallback tree. IDs 8 and 9 are handled first as synthesized midpoints and return true unconditionally after their recursive lookups. Other IDs first use a registered JObj if one exists; only absent registrations activate the reserved-ID aliases and special cases. Unrecognized IDs with no registration return false.

[Canonical lines 607-686](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L607-L686).

### Ground_801C2ED0

The JObj originates from a Ground_GObj's render object and the map ID from its Ground payload. The function first asks grDatFiles_801C6330 for a loaded archive containing that map ID and processes every GrJoint in the indexed archive entry. It then scans the current stage's static GrJoint table and processes entries whose `y` field equals the map ID. Each selected record supplies its `x` collision-joint index and `z` metadata to the mpLib setup sequence; after both sources are exhausted, the map ID is forwarded to Ground_801C3214 and the function returns whether either source supplied a joint. The routine begins with a false result. A missing loaded archive merely skips the archive-joint pass; the current stage's joint table is always scanned. Every archive joint is processed, while a current-stage joint is processed only when its map identifier equals the requested map ID. Processing any joint makes the result true. Ground_801C3214 is called once regardless of whether a joint was found, after which the accumulated result is returned.

[Canonical lines 1642-1672](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1642-L1672).

### Ground_801C2FE0

Reads `map_id` from the input object's `Ground` payload. That ID selects an activity flag, filters the current stage's `GrJoint` table, and selects an optional retained archive entry. Each matching `GrJoint::x` supplies a collision-joint ID to `mpLib_80055E9C`; the corresponding `CollJoint::xC` receives the incremented `Ground_804D6954` generation value. The function returns true if any updater call occurred and false otherwise. Refreshes the active collision joints associated with a Ground map object, covering joints declared by the current stage and additional joints supplied by the loaded archive while avoiding duplicate archive-side refreshes. The refresh runs only while `Ground_804D6950[map_id]` is zero; a nonzero entry causes an immediate false result. Each permitted call advances a shared generation counter. Stage-table matches are refreshed and stamped first, then archive-table matches are refreshed only when their CollJoint stamp differs from the current generation. Neighboring helpers establish zero as the registered/enabled state: one changes 1 to 0 and adds the map object's joints to the collision list, while another changes 0 to 1 and removes them.

[Canonical lines 1676-1732](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1676-L1732).

### Ground_801C3128

The component ID selects joints from two sources: the current stage definition's `stage_datas[stage_info.grkind]->joints` array, where matching rows have `GrJoint::y == map_id`, and the loaded archive returned by `grDatFiles_801C6330(map_id)`, whose indexed entry supplies an additional joint array and count. Every selected row's `GrJoint::x` flows to the callback, and the function returns whether either source produced at least one row. Enumerates every collision-joint ID associated with one stage Ground component and applies a caller-supplied collision-system operation to each ID, reporting whether at least one joint was processed. The routine always visits all matching joints rather than stopping after the first. It starts with a false result, changes it to true after any callback invocation, skips the archive-backed pass when no loaded archive owns the component ID, and otherwise performs no state transition of its own; mutations are delegated entirely to the supplied callback.

[Canonical lines 1734-1769](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1734-L1769).

### Ground_801C3214

The caller supplies a map GObj ID. That ID indexes `Ground_804D6950`; when its byte equals 1, the function writes 0 and passes the ID plus `mpJointListAdd` to `Ground_801C3128`. The shared helper scans the current stage's primary `GrJoint` table for entries whose map-object field equals the ID, then scans any archive-backed joint table returned for that ID, forwarding each matching joint index to `mpJointListAdd`. Its accumulated boolean result is returned unchanged. Activates the stage-collision joints associated with a map GObj ID when that ID is marked inactive, preventing duplicate activation and reporting whether any associated collision joint was found and added. This is a one-way guarded transition from per-map-object state 1 to state 0. If the byte is not 1, it performs no write or collision registration and returns false. If it is 1, the byte is cleared before any collision joints are enumerated, and the function returns whether the enumeration found at least one joint. The adjacent inverse routine transitions the same byte from 0 to 1 and applies `mpLib_80057BC0`, confirming that the byte gates mutually exclusive collision-registration operations.

[Canonical lines 1771-1779](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1771-L1779).

### Ground_801C3260

Disables every stage-collision joint associated with a numbered Ground map-object group, while latching that group as disabled so repeated requests do not redundantly process the same collision geometry. When the selected latch is 0, the function changes it to 1 and attempts to disable all associated collision joints. When the latch is already 1, it performs no work and returns false. The latch remains 1 even if no associated joint is found, in which case the first call also returns false. The adjacent inverse routine accepts only latch state 1, clears it to 0, and applies `mpJointListAdd` to reactivate the group's collision joints.

[Canonical lines 1781-1788](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1781-L1788).

### Ground_801C32AC

Calls Ground_801C3128 with the supplied map ID and mpLib_80057424, discarding the iterator Boolean. The iterator forwards each matching descriptor or archive joint ID without deduplication; callback internals are outside this review.

[Canonical lines 1790-1793](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1790-L1793).

### Ground_801C32D4

The component/map ID selects records from two sources. The function first scans `stage_datas[stage_info.grkind]->joints`, comparing each record's component field and model-joint field with the two arguments and retaining its collision-joint field. It then asks `grDatFiles_801C6330` for an archive containing the component entry and scans that entry's joint table for the same model-joint ID. The final retained collision-joint index, or `-1`, is returned to stage-specific code for collision-list operations. Resolves a stage Ground component's model-joint identifier to the corresponding collision-joint index, searching both the active stage's primary joint-mapping table and any retained supplemental archive for that component. The lookup begins in a not-found state represented by `-1`. Every matching primary-table record replaces the current result, so the last primary match wins. If a qualifying supplemental archive exists, every matching archived record replaces it again, making the last archived match override any primary result. Missing archives and tables with no matching joint leave the prior result unchanged; the routine itself performs no persistent state mutation.

[Canonical lines 1795-1827](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1795-L1827).

### Ground_801C33C0

Resolves a stage Ground component's local joint reference to the corresponding model-hierarchy joint index. It searches both the selected stage descriptor's shared joint-mapping table and the loaded archive entry for the requested map-object ID, returning the mapped index or `-1` when neither source contains it. This is a read-only lookup with `-1` as its initial and failure state. It scans every base-stage mapping rather than stopping at the first match, so a later duplicate replaces an earlier one. It then conditionally scans the loaded archive mapping and likewise retains the last match there, giving archive data precedence over the base descriptor. If no archive owns the map ID, or neither table matches the local joint index, it returns the prior result unchanged.

[Canonical lines 1829-1862](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1829-L1862).

### Ground_801C34AC

The map ID flows into `grDatFiles_801C6330` to select the owning archive. The archive's stage-data rows are searched by source-joint identity; the matched row supplies a count and an array of signed 16-bit pairs. Each pair's first value is interpreted as a zero-based JObj traversal index and its second value as an index into `stage_info.x280`. The traversal produces an `HSD_JObj*`—or null if the requested index lies beyond the hierarchy—which is stored in that global slot. A later companion routine scans the same table and clears entries whose topmost ancestor is the specified root. Populates the stage-wide JObj reference table for a newly loaded Ground scene hierarchy by finding the archive metadata associated with its source joint and resolving that metadata's traversal-index-to-reference-slot pairs into concrete runtime JObj pointers. Returns without modifying references when no owning archive exists, the archive has no metadata rows, or no row matches the supplied joint; null `root` or `joint` also produces an error report before returning. For every pair in a matched row, it traverses the hierarchy in depth-first, left-to-right order: descend to a child unless the node is a `JOBJ_INSTANCE`, otherwise take a next sibling, or repeatedly ascend until an ancestor's next sibling is found or the hierarchy is exhausted. It reuses the previous traversal position for nondecreasing target indices and restarts at the root when the next target index moves backward. The resolved node, including null on exhaustion, replaces the designated global reference slot.

[Canonical lines 1901-1987](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1901-L1987).

### Ground_801C36F4

Ground_801C4A08 supplies the destroyed object's `Ground::map_id`, its `gobj->hsd_obj` JObj root, and the loaded archive's indexed joint identity. The function resolves the archive again through grDatFiles_801C6330, searches the archive's stage-entry table for that identity, then reads every stage_info.x280 JObj registration. For each non-null registration it follows parent pointers to the topmost JObj and writes null back to the slot when that root equals the supplied root. The archive lookup is asserted to succeed. A null root or joint is reported and causes an early return; an archive with no stage entries also returns immediately. The function performs no cleanup unless the supplied joint identity occurs in the archive's entry table. Once found, it examines exactly 261 reference slots: null slots are ignored, non-null slots are traced through all parents, and every slot rooted at the supplied JObj is cleared. The JObj hierarchy itself is not modified.

[Canonical lines 1989-2042](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1989-L2042).

### Ground_801C3880

Sets the top edge of the shared stage camera-bounds rectangle used by the Ground subsystem.

[Canonical lines 2044-2047](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2044-L2047).

### Ground_801C3890

Immediately and unconditionally overwrites the current stage camera's stored bottom bound. It performs no validation, clamping, transition, or timer handling; the new value remains in global `stage_info` until another initialization path or setter replaces it.

[Canonical lines 2049-2052](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2049-L2052).

### Ground_801C38A0

Sets the left edge of the shared stage camera-bounds rectangle used by the Ground subsystem. Unconditionally replaces the current left camera-bound value with the supplied float; it performs no validation, clamping, accumulation, or other state transition.

[Canonical lines 2054-2057](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2054-L2057).

### Ground_801C38AC

Sets the right edge of the current stage's camera-bounds rectangle in the shared `stage_info` camera configuration. Unconditionally replaces the current right camera-bound value immediately; it performs no validation, clamping, accumulation, or transition guard.

[Canonical lines 2059-2062](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2059-L2062).

### Ground_801C38BC

Sets the shared stage camera's horizontal and vertical offset coordinates.

[Canonical lines 2064-2068](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2064-L2068).

### Ground_801C38D0

Unconditionally replaces all four corresponding fields in the active global stage-camera record. It has no guards, clamping, conversion, callbacks, or immediate camera-object update; the new configuration remains in `stage_info.cam_info` for later camera accessors and calculations to consume.

[Canonical lines 2070-2076](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2070-L2076).

### Ground_801C38EC

Configures the active stage's camera maximum-depth and zoom-rate settings during common Ground initialization. As part of the transition from loaded stage data to initialized runtime Ground state, the function unconditionally replaces both active camera settings with the selected stage's configured values; it performs no validation, interpolation, or conditional update.

[Canonical lines 2078-2082](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2078-L2082).

### Ground_801C3900

Installs the selected stage's pause-camera depth parameters and directional camera-angle limits into the global stage camera configuration during Ground initialization.

[Canonical lines 2084-2095](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2084-L2095).

### Ground_801C392C

Installs a stage's fixed-camera pose and field-of-view configuration into the global stage camera state so that fixed-camera setup and camera-facing stage services can consume it. The function unconditionally replaces all six retained fixed-camera parameters; it performs no validation, interpolation, mode transition, or immediate camera call. Camera-mode selection remains a separate operation that chooses fixed or standard mode from the stage's fixed-camera flag.

[Canonical lines 2097-2105](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2097-L2105).

### Ground_801C3950

During common stage setup, `Ground_801C0800` reads the selected stage parameter at `stage_info.param->x24` and passes it to this function, which persists the value in `stage_info.cam_info.cam_fixed_zoom` for the stage camera configuration. Sets the current stage's fixed-camera zoom configuration.

[Canonical lines 2107-2110](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2107-L2110).

### Ground_801C3960

During common stage initialization, `Ground_801C0800` reads offset `x20` from the loaded `GroundParam` object and passes it to this function, which copies the value into `stage_info.cam_info.cam_track_ratio` for the active stage. Sets the current stage's camera-tracking ratio in the global stage camera configuration. Immediately overwrites the active stage's camera-tracking ratio without validation, clamping, branching, or an intermediate transition.

[Canonical lines 2112-2115](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2112-L2115).

### Ground_801C3970

C2044–2140 direct camera/blast setters exactfields, no validation/clamping. C2142–2247 camrange markers149/150 bounds sortedrelative148offset, else stage-specificdummydefaults. C2249–2330 deadbounds markers151/152 sortedrelative currentcameraoffset elsedummyperstage. Targetfamilyfallsdefaultifmissingmarkers, no authoredcoursegeometryestablished.

[Canonical lines 2117-2120](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2117-L2120).

### Ground_801C3980

Sets the active stage's stored top blast-zone boundary. Immediately and unconditionally replaces the active stage's stored top blast-zone boundary; it performs no validation, clamping, branching, or adjustment of the supplied value.

[Canonical lines 2122-2125](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2122-L2125).

### Ground_801C3990

C2044–2140 direct camera/blast setters exactfields, no validation/clamping. C2142–2247 camrange markers149/150 bounds sortedrelative148offset, else stage-specificdummydefaults. C2249–2330 deadbounds markers151/152 sortedrelative currentcameraoffset elsedummyperstage. Targetfamilyfallsdefaultifmissingmarkers, no authoredcoursegeometryestablished.

[Canonical lines 2127-2130](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2127-L2130).

### Ground_801C39A0

Replaces the active stage's stored left blast-zone boundary with a caller-supplied horizontal coordinate. On every invocation, the function unconditionally overwrites only the left edge of the active blast-zone rectangle; it has no guard, clamping, transition logic, or changes to the top, bottom, or right edges.

[Canonical lines 2132-2135](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2132-L2135).

### Ground_801C39B0

Sets the active stage's base right blast-zone boundary.

[Canonical lines 2137-2140](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2137-L2140).

### Ground_801C39C0

Requests world-space positions for stage marker IDs `0x95`, `0x96`, and `0x94` through `Ground_801C2D24`. The first two positions provide opposite corners; their X and Y components are sorted and translated relative to marker `0x94`. The translated extrema become `stage_info.cam_info.cam_bounds`, while marker `0x94` itself becomes `cam_x_offset` and `cam_y_offset`. If any request fails, equivalent values come from a `stage_info.grkind`-selected fallback table. Initializes the active stage's camera-tracking rectangle and its horizontal and vertical origin offsets from stage-authored position markers, falling back to hardcoded stage-specific camera settings when those markers are unavailable. The marker-derived path is taken only when all three position queries succeed. It orders the two corner markers independently on X and Y, producing normalized left/right and bottom/top bounds around the `0x94` origin. If any query fails, it reports that a dummy camera range is being used and selects fixed bounds and offsets for Castle, Corneria, internal kind 26, Mushroom Kingdom II, Rainbow Cruise, Yoshi's Story, or Mute City, with a shared default for other stages.

[Canonical lines 2142-2247](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2142-L2247).

### Ground_801C3BB4

Coordinate IDs 0x97 and 0x98 flow through Ground_801C2D24 into two Vec3 values. Their minimum and maximum X and Y components are reduced by stage_info.cam_info.cam_x_offset and cam_y_offset respectively, then stored as stage_info.blast_zone.left, right, bottom, and top. If either lookup fails, stage_info.grkind selects literal fallback values that are written to the same four fields. Initializes the active stage's blast-zone rectangle. It prefers two stage-provided coordinate points, normalizes their axes into left/right and bottom/top boundaries after applying camera offsets, and installs stage-specific dummy boundaries if either point cannot be obtained. When both boundary coordinates are available, the function orders them independently on X and Y so reversed point placement still yields a normalized rectangle. If either lookup fails, it reports use of a dummy DeadRange and chooses these fallback bounds: default left/right -250/250, top 200, bottom -100; Castle changes top/bottom to 180/-150; Corneria uses -550/550, 200/-100; Gr_Kind_Unk26 uses -600/600, 200/-100; Shrine uses -550/550, 200/-150; Inishie2 uses -300/300, 300/-160; RCruise uses -300/300, 270/-240; and Yorster uses -300/300, 210/-240. Both branches finish by replacing all four active blast-zone fields.

[Canonical lines 2249-2330](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2249-L2330).

### Ground_801C3D44

The optional predicate flows into `stage_info.x90`; the two floating-point inputs are multiplied by 0.5 and stored in `stage_info.x70C` and `stage_info.x710`. The pre-existing primary-channel result in `stage_info.x714` is returned unchanged and, when not `-1`, is also copied to `stage_info.x6D0` while flag 0x10 is asserted. An invalid result clears flag 0x10 and leaves x6D0 untouched. Configures the primary common-Ground trigger/query channel used by stage processes: it enables the channel, installs an optional predicate, stores two half-scaled configuration values, publishes any currently valid channel result into shared stage state, and returns that result to the caller. Each call marks the primary channel enabled. If its retained result `x714` is valid, the routine marks primary-result flag 0x10 active and publishes that result to `x6D0`; if the result is `-1`, it clears only flag 0x10. It does not itself invoke the predicate or calculate a new result, so evaluation occurs elsewhere in the common Ground lifecycle.

[Canonical lines 2332-2345](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2332-L2345).

### Ground_801C3DB4

Common stage reset leaves this trigger channel disabled with no callback and result `-1`. Every call enables the channel and replaces its callback and half-extents. If the current result is not `-1`, the function sets StageInfo flag bit `0x40`; otherwise it clears that bit. It does not consume or reset the result, allowing route controllers to poll the current marker on successive updates.

[Canonical lines 2347-2359](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2347-L2359).

### Ground_801C3E18

Receives a candidate HSD_JObj and returns jobj->aobj immediately when present; otherwise it searches jobj->child before jobj->next and propagates the first non-null recursive result. Ground_801C3F20 consumes the result by returning its curr_frame field, or 0.0 when the search fails. Performs a read-only, short-circuiting hierarchy search: a null node terminates that branch, an AObj on the current node succeeds immediately, and otherwise the child branch is searched before the sibling branch. It neither advances nor modifies animation state.

[Canonical lines 2361-2379](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2361-L2379).

### Ground_801C3F20

The input HSD_JObj pointer flows into Ground_801C3E18, which searches the node, then its child subtree, then its next-sibling chain for the first non-null AObj. The resulting HSD_AObj pointer is null-checked, and its curr_frame field flows unchanged to the caller; a null result instead produces 0.0. Safely queries the supplied JObj hierarchy for the first attached animation object and returns its current animation frame, using 0.0 when the hierarchy contains no AObj. The function does not advance or mutate animation state. It performs a guarded observation: an AObj found in the JObj hierarchy yields its current frame, while failure to find one yields 0.0.

[Canonical lines 2381-2388](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2381-L2388).

### Ground_801C3FA4

Retrieves a stage-model JObj by its zero-based position in the root JObj's flag-sensitive depth-first child hierarchy, allowing stage initialization and animation code to refer to scene joints by compact integer indices.

[Canonical lines 909-937](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L909-L937).

### Ground_801C4100

Receives the current HSD_JObj and reads its flags plus child, next-sibling, and parent links. It returns the current node's eligible child, its next sibling, or the first next sibling found while ascending its ancestor chain; if ascent reaches a parentless node, it returns NULL. The input hierarchy is not mutated. Advances an HSD_JObj cursor to the next joint in depth-first, child-before-sibling hierarchy order, allowing callers to enumerate a model hierarchy one joint at a time without maintaining an explicit traversal stack. Traversal is child-first unless the current joint has JOBJ_INSTANCE set, in which case its child hierarchy is treated as a boundary and skipped. When no eligible child exists, traversal advances to a sibling; when no sibling exists, it repeatedly ascends until an ancestor sibling is available. Reaching the top terminates traversal with NULL.

[Canonical lines 2426-2443](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2426-L2443).

### Ground_801C4210

Initializes a Target Test course's breakable targets by spawning one `It_Kind_Mato` item at each available target-placement joint and recording how many targets were successfully created.

[Canonical lines 2445-2464](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2445-L2464).

### Ground_801C42AC

C2445–2464 targets markers199..219 inclusive, nonNULLjoint andnonNULLit8027B5B0(Mato,0,joint,NULL,0) incrementcount; setsbothx6D4/x6D2 evenzero, returnscount. C2466–2480 markers252..259, partiallyinitialized BobOmbRain descriptor x14=20/x4joint/b0true, foreignspawnreturnignored.

[Canonical lines 2466-2480](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2466-L2480).

### Ground_801C4338

Decrements stage_info.x6D4 without a guard and ORs stage flag 0x20 only when the new count equals zero. It leaves x6D2 unchanged, does not clear flags and does not validate notification count or event provenance.

[Canonical lines 2482-2488](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2482-L2488).

### Ground_801C4368

A read-only snapshot accessor over a two-sample level history. It performs no transition; `Ground_801C438C` advances `(previous, current)` to `(current, new_value)`, so the second output is positive while the level rises, negative while it falls, and zero when successive samples match.

[Canonical lines 2490-2494](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2490-L2494).

### Ground_801C438C

C2482–2488 targetdecrementunchecked; OR0x20 onlyexactzero, noflagclear/no initialzero completion. C2490–2500 getcurrent+delta, setterprev=current thennew. C2502 wrappergrZebes no internals. C2507–2529 archiveentry pointeridentityfirstmatch flagbool; nullarg/emptyfalse;missing nonemptyassert; noarchiveguards.

[Canonical lines 2496-2500](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2496-L2500).

### Ground_801C43A4

Forwards its UNK_T argument unchanged to grZebes_801DA3F4. It has no local guard, return value or state write; effect and lifecycle semantics belong to the callee.

[Canonical lines 2502-2505](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2502-L2505).

### Ground_801C43C4

Reads the current ground archive's table at `unk20` and count at `unk24`, compares the input descriptor with each stored pointer, and returns the matched entry's one-bit flag. Stage-light initialization consumes a true result by setting `AOBJ_LOOP` on the corresponding light, position, and interest animation controllers. Looks up a light-animation descriptor in the current stage archive's animation-flag table and reports whether that descriptor is configured to loop. Returns false without searching when the descriptor is null or the archive table is empty. A found descriptor returns its entry's flag; a non-null descriptor missing from a nonempty table triggers an assertion before the false fallback. The lookup performs no state mutation.

[Canonical lines 2507-2529](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2507-L2529).

### Ground_801C445C

A Ground GObj process callback passes `gobj->hsd_obj` as an `HSD_LObj*` list. The function snapshots the list head's position and interest vectors, animates each current list member, and multiplies changed head endpoints by `stage_info.param->y` or 1.0 before writing them back. Advances animation for a linked list of stage light objects while applying the current stage parameter's Y value as a coordinate scale to animated position and interest-point changes on the list's head light. A NULL light-list head is an immediate no-op. Otherwise every list member receives one HSD_LObjAnim step in linked-list order. Position and interest scaling is conditional: an endpoint is rewritten only when its post-animation vector differs exactly from its pre-animation vector in at least one component. A missing stage parameter block does not stop animation and selects the identity scale 1.0; an existing block supplies its Y field as the scale. Notably, endpoint reads and writes use the original `lobj` pointer rather than the iteration variable `cur`, so the scaling checks target the list head while animation advances each current member.

[Canonical lines 2531-2578](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2531-L2578).

### Ground_801C461C

Passes gobj->hsd_obj to Ground_801C445C without checking gobj. The callee animates every light but reads and scales changed position and interest vectors only on the original list head.

[Canonical lines 2580-2583](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2580-L2583).

### Ground_801C4640

Passes gobj->hsd_obj to HSD_LObj_803668EC, then calls HSD_LObjSetupInit with HSD_CObjGetCurrent. The GX callback ignores its integer code and has no local null guard.

[Canonical lines 2585-2589](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2585-L2589).

### Ground_801C466C

Scans the active stage's callback records for the first `flags_b0 == 1` entry, resolves its archived LightList, and falls back to built-in lights when none is selected. It instantiates an HSD_LObj chain, attaches it to a new GObj, scales available light endpoints by `stage_info.param->y` or 1.0, initializes animation state, and registers render and update callbacks. Creates and initializes the stage's runtime light-object chain, registers it as a rendered and per-frame-updated HSD_GObj, and prepares authored light animations for playback.

[Canonical lines 2639-2751](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2639-L2751).

### Ground_801C498C

Traverses HSD_GObj_Entities->xC and returns the first GObj whose classifier equals HSD_GOBJ_CLASS_GROUND, or NULL. The body does not check the attached object kind or require an HSD_LObj payload.

[Canonical lines 2753-2762](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2753-L2762).

### Ground_801C49B4

Provides the light list used to construct the current stage's lighting objects. When the stage has a map light list, it first applies the current ground archive's stage-specific light overrides; otherwise it returns a shared fallback list.

[Canonical lines 2764-2771](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2764-L2771).

### Ground_801C4A08

For a nonnull GObj, optionally calls the Ground removal callback, clears only a matching map registry slot, stops stored sound handles, unregisters and destroys an auxiliary object, conditionally disables map collision, and clears matching hierarchy references when an archive is available. Finally submits the primary GObj to generic destruction. Missing Ground data skips Ground-specific cleanup.

[Canonical lines 2791-2827](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2791-L2827).

### Ground_801C4B50

When the normalized tangent is nearly vertical (`abs(tangent.y) > 0.9`), the function uses the positive Z axis as its reference; otherwise it uses the positive Y axis, avoiding an almost-parallel cross product. During angle extraction it also detects the near-singular case `abs(basis1.z) >= 0.99999`, computes a reduced two-angle solution, and forces the third angle to zero; all other orientations use the full three-angle decomposition with quadrant corrections.

[Canonical lines 2829-2881](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2829-L2881).

### Ground_801C4D70

C2883–2918 barreltransformstore/getuncheckedptrs truealways, two stage-kinddispatchers Kongo/OldKongo only, otherkindstruewithoutaction, helperinternalsunverified. C2920–2937 setb3 before sixpointtransform/store calls.

[Canonical lines 2883-2889](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2883-L2889).

### Ground_801C4DA0

C2883–2918 barreltransformstore/getuncheckedptrs truealways, two stage-kinddispatchers Kongo/OldKongo only, otherkindstruewithoutaction, helperinternalsunverified. C2920–2937 setb3 before sixpointtransform/store calls.

[Canonical lines 2891-2896](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2891-L2896).

### Ground_801C4DD0

Consumes no explicit arguments. It reads `stage_info.grkind` to choose a destination and forwards `stage_info.x72C` to `grKongo_801D8270` for `Gr_Kind_Kongo` or to `grOldKongo_802105AC` for `Gr_Kind_OldKongo`; other stage kinds receive no call. Its return value is always `true`.

[Canonical lines 2898-2907](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2898-L2907).

### Ground_801C4E20

C2883–2918 barreltransformstore/getuncheckedptrs truealways, two stage-kinddispatchers Kongo/OldKongo only, otherkindstruewithoutaction, helperinternalsunverified. C2920–2937 setb3 before sixpointtransform/store calls.

[Canonical lines 2909-2918](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2909-L2918).

### Ground_801C4E70

Six JObjs selected by stage-specific initialization code flow through `lb_8000B1CC(jobj, NULL, &vec)`, resolving each joint origin to a world-space Vec3. The vectors are stored in `stage_info.x130` through `stage_info.x16C`; `Ground_801C4FAC` later selects or blends a near/far pair according to camera direction, measures it from the camera eye, and writes the resulting distances to stage fog. Enables camera-relative stage fog and configures its six spatial reference points by snapshotting the world-space origins of six stage-model JObjs into three near/far endpoint pairs used by the camera fog updater. Calling the routine unconditionally sets `stage_info.unk8C.b3`, enabling subsequent camera-driven fog updates, and replaces all six fog-reference vectors with snapshots of the supplied joints' current world positions. It performs no incremental update or guard checks; later calls completely reconfigure the endpoint set.

[Canonical lines 2920-2937](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2920-L2937).

### Ground_801C4FAC

Updates the active stage fog object's start and end distances from the current camera position and viewing direction, using stage-configured directional anchor pairs so the fog range follows the camera's orientation through the stage environment. The routine is inactive unless `stage_info.unk8C.b3` is set. While enabled, the eye direction's X sign selects a configured endpoint pair and a negative Z direction enables weighted interpolation with another pair. No fog mutation occurs if the stage fog GObj or payload is absent. For valid fog, start is bounded below by 5, end by 10, and an inverted interval is repaired to `end = start + 1`.

[Canonical lines 2962-3063](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2962-L3063).

### Ground_801C53EC

On every invocation, without guards, branches, timers, or local state changes, immediately submits one playback request with the same fixed volume and pan. Event timing and sound selection are owned by the calling stage state machine rather than this helper.

[Canonical lines 3067-3070](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3067-L3070).

### Ground_801C5414

The wrapper is stateless and unconditional: every invocation makes exactly one audio request, with no guard, timer, local state mutation, or failure handling, and ignores the audio helper's returned key.

[Canonical lines 3072-3075](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3072-L3075).

### Ground_801C5440

A stage routine supplies a Ground payload, audio-slot index, and SFX ID. For an ordinary ID, the function keys off any handle already in `gp->x20[slot]`, starts the requested SFX at volume `0x7F` and pan `0x40`, and writes the returned voice handle back to the slot. Other Ground audio helpers subsequently query, stop, or adjust that handle. Starts, replaces, or stops a sound-effect voice assigned to one of eight slots in a Ground object's stage-audio handle table. The routine leaves state unchanged when the slot is outside 0–7, the Ground pointer is null, or `sfx_id` is 540000. An ordinary SFX ID replaces the selected slot's current voice, keying it off first when present. Sentinel 540001 instead stops the current voice and resets the slot to `-1` through `Ground_801C5544`.

[Canonical lines 3079-3099](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3079-L3099).

### Ground_801C54DC

Checks whether one of a Ground object's eight managed sound-effect slots currently contains an active audio voice.

[Canonical lines 3101-3110](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3101-L3110).

### Ground_801C5544

Invalid indices and null Ground pointers are no-ops. For a valid slot, an occupied handle is keyed off before the slot transitions to empty; an already-empty slot skips the audio call but remains empty. The adjacent aggregate cleanup helper applies this transition to all eight slots.

[Canonical lines 3112-3125](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3112-L3125).

### Ground_801C55AC

Stops every sound-effect voice owned by a Ground component and invalidates all eight of its stored audio handles, providing bulk audio cleanup when that component is destroyed. A null Ground pointer is a no-op. Otherwise, after the routine returns, all eight audio slots are `-1`; slots that previously held active handles have been keyed off, while already inactive slots remain inactive. Repeating the operation does not issue additional key-offs for slots already cleared.

[Canonical lines 3127-3135](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3127-L3135).

### Ground_801C5630

For a nonnull Ground pointer, index 0 through 7 and non-minus-one slot handle, calls lbAudioAx_80024B58 with that handle and 127 times the supplied float. Invalid inputs do nothing; the local function does not clamp the float or change the stored handle.

[Canonical lines 3137-3145](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3137-L3145).

### Ground_801C5694

Receives a Ground object, an audio-slot index, and a normalized pan value. After rejecting indices outside 0–7, null Ground pointers, and slots whose handle is -1, it reads `ground->x20[sound_slot]`, converts pan with `63.5f * (pan + 1)`, and sends the handle and converted value to `lbAudioAx_80024B1C`. It does not modify the Ground object.

[Canonical lines 3147-3155](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3147-L3155).

### Ground_801C5700

Provides a null-safe common Ground entry point for querying the active stage's line-touch callback, returning that callback's `DynamicsDesc` for a collision line or `NULL` when no callback is registered. Has one guard and no direct state mutation: when `stage_info.on_touch_line` exists, it runs immediately and its result is returned; otherwise the function returns `NULL`. Timer changes, collision effects, and buried-state transitions remain owned by callers.

[Canonical lines 3157-3163](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3157-L3163).

### Ground_801C5740

C3157–3163 optionaltouchlinecallbackelseNULL. C3165–3193 directstatus/x6DC/x740getsets. C3195–3203 player0entity andindex1helper returns. C3208 ignoresarg returnsx6E0;callercommentunverified.

[Canonical lines 3165-3168](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3165-L3168).

### Ground_801C5750

C3157–3163 optionaltouchlinecallbackelseNULL. C3165–3193 directstatus/x6DC/x740getsets. C3195–3203 player0entity andindex1helper returns. C3208 ignoresarg returnsx6E0;callercommentunverified.

[Canonical lines 3170-3173](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3170-L3173).

### Ground_801C5764

C3157–3163 optionaltouchlinecallbackelseNULL. C3165–3193 directstatus/x6DC/x740getsets. C3195–3203 player0entity andindex1helper returns. C3208 ignoresarg returnsx6E0;callercommentunverified.

[Canonical lines 3175-3178](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3175-L3178).

### Ground_801C5774

C3157–3163 optionaltouchlinecallbackelseNULL. C3165–3193 directstatus/x6DC/x740getsets. C3195–3203 player0entity andindex1helper returns. C3208 ignoresarg returnsx6E0;callercommentunverified.

[Canonical lines 3180-3183](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3180-L3183).

### Ground_801C5784

C3157–3163 optionaltouchlinecallbackelseNULL. C3165–3193 directstatus/x6DC/x740getsets. C3195–3203 player0entity andindex1helper returns. C3208 ignoresarg returnsx6E0;callercommentunverified.

[Canonical lines 3185-3188](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3185-L3188).

### Ground_801C5794

C3157–3163 optionaltouchlinecallbackelseNULL. C3165–3193 directstatus/x6DC/x740getsets. C3195–3203 player0entity andindex1helper returns. C3208 ignoresarg returnsx6E0;callercommentunverified.

[Canonical lines 3190-3193](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3190-L3193).

### Ground_801C57F0

Reads `stage_info.x6E0` without mutation and returns that single-precision value unchanged. Exposes the current value of the Ground subsystem's `stage_info.x6E0` measurement to external code through a read-only floating-point accessor.

[Canonical lines 3208-3211](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3208-L3211).

### Ground_801C5840

C3213–3220 paramnonnull selectsCameraFixed/Standard. C3222–3226 callsRandi1 thenx6E4index. C3233–3246 tyinithelper then1Pselect/load/store else-1. C3251–3260 positionreturnignored, spawnthenToynotificationunconditional evenNULLspawn, returnsnullableitem.

[Canonical lines 3222-3226](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3222-L3226).

### Ground_801C5878

C3213–3220 paramnonnull selectsCameraFixed/Standard. C3222–3226 callsRandi1 thenx6E4index. C3233–3246 tyinithelper then1Pselect/load/store else-1. C3251–3260 positionreturnignored, spawnthenToynotificationunconditional evenNULLspawn, returnsnullableitem.

[Canonical lines 3233-3246](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3233-L3246).

### Ground_801C58E0

The wrapper has no branch or timer: it always attempts marker resolution, calls the trophy constructor, and performs the trophy-state update even when allocation returns null. It ignores the resolver's boolean result; the demonstrated route caller first validates the same marker and retains only a non-null constructed object.

[Canonical lines 3251-3260](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3251-L3260).

### Ground_801C5940

Selects a reference marker from archive metadata. Collects at most the first 32 occurrences whose pair second value is 220 through 251, preserving duplicates, then returns a random collected marker or -1 when none qualify. These values are reserved stage markers, not Zako enemy-kind identifiers.

[Canonical lines 3270-3304](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3270-L3304).

### Ground_801C5A28

Calls Toy_803124BC, Toy_8031234C(0), then Toy_80305918(0,0,1), in that order. There is no local guard or direct state write; the Toy helpers determine persistence and category effects.

[Canonical lines 3306-3311](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3306-L3311).

### Ground_801C5A60

Calls Toy_8031234C(1) once and returns. The wrapper has no guard or local state mutation; working-to-persistent copy semantics require the Toy implementation.

[Canonical lines 3313-3316](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3313-L3316).

### Ground_801C5A84

Copies the supplied signed integer into stage_info.x98 without validation or audio calls. Ground_801C5A94 returns the same field.

[Canonical lines 3318-3321](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3318-L3321).

### Ground_801C5A94

Returns stage_info.x98 unchanged, without mutation or audio calls. Track selection and timing are not implemented in this accessor.

[Canonical lines 3323-3326](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3323-L3326).

### Ground_801C5AA4

Assigns the supplied Boolean to stage_info.unk8C.b1. The adjacent getter returns that bit; this setter does not choose or play a track.

[Canonical lines 3328-3331](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3328-L3331).

### Ground_801C5ABC

Is a side-effect-free query of a two-state Ground flag. It neither toggles nor clears the flag; state changes are performed by the paired Boolean setter `Ground_801C5AA4`.

[Canonical lines 3333-3336](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3333-L3336).

### Ground_801C5AD0

The input index selects one `StageData*` from the private `stage_datas` registry; the function dereferences that descriptor and returns its `flags2` word unchanged. Returns the secondary flag word stored in an indexed stage descriptor while keeping the private `stage_datas` registry encapsulated within the Ground subsystem. This is a stateless, read-only lookup with no bounds check, null-entry check, fallback, or mutation. Callers must supply an index whose `stage_datas` entry is valid and non-null.

[Canonical lines 3338-3341](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3338-L3341).

### Ground_801C5AEC

Converts an orthonormal basis into Euler rotation angles for a stage object, then sanitizes each resulting component independently by replacing non-finite or implausibly large values with zero before the rotation is consumed. After Euler extraction, the function treats X, Y, and Z independently: a component is preserved when `ABS(component) < 30000`, otherwise it is reset to `0.0f`. Thus one invalid component does not discard valid values on the other axes, and the routine has no persistent state, timer, or transition of its own.

[Canonical lines 3343-3355](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3343-L3355).

### Ground_ApplyStageBackgroundColor

The global stage_info.x12C pointer is passed through GET_FOG. When both the stage asset pointer and resulting HSD_Fog pointer are non-null, fog->color.r, fog->color.g, and fog->color.b flow unchanged into Camera_SetBackgroundColor; otherwise three zero-valued channels are sent instead. Configures the camera's background clear color from the active stage asset's fog color, falling back to black when the stage asset or its fog object is unavailable. Per invocation, the routine has two guarded outcomes: a non-null stage asset with a non-null fog object installs that fog object's RGB color, while either missing pointer selects black. It does not retain local state or alter the stage descriptor.

[Canonical lines 1140-1148](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1140-L1148).

### Ground_DemoInit

Receives a stage identity pair and a signed demo-initialization argument, reads `pair->grkind`, uses that value to select a `stage_datas` entry, reads its `on_demo_init` function pointer, and forwards the integer argument unchanged through the indirect call. It produces no local return value or other visible output; effects are delegated to the selected callback. Dispatches demo initialization to the implementation registered for the selected stage Ground kind, providing a common stage-system entry point without embedding stage-specific demo behavior.

[Canonical lines 712-715](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L712-L715).

### Ground_EnableMatchCamera

Reads `stage_info.param->x4C_fixed_cam` from the globally active stage configuration. A nonzero value is consumed by `Camera_SetModeToFixed`; zero is consumed by `Camera_SetModeToStandard`. The function writes no Ground data and communicates its decision solely through the selected camera subsystem call. Restores or enables the camera mode appropriate to the current stage, selecting the fixed-camera implementation for a stage marked as fixed-camera and the standard match camera otherwise. Has two mutually exclusive, stateless branches: when the current stage's fixed-camera flag is set it enters fixed camera mode; otherwise it enters standard camera mode. It performs no timer, transition guard, or persistent state update of its own beyond the delegated camera-mode change.

[Canonical lines 3213-3220](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3213-L3220).

### Ground_GetMapGObj

Returns the registered Ground game object for a caller-supplied stage map-object identifier. This is a read-only registry query: it performs no stage or object-state transition and returns the current slot value, including NULL for an unregistered object. It performs no bounds validation, so callers must provide a valid map-object index.

[Canonical lines 1546-1549](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1546-L1549).

### Ground_GetP1Fighter

Provides ground and stage code with a convenience accessor for the fighter game object currently designated as the primary entity of player slot 0.

[Canonical lines 3195-3198](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3195-L3198).

### Ground_GetP1Fighter2

Returns player slot 0's secondary logical fighter entity so stage code can account for an optional second fighter belonging to player 1.

[Canonical lines 3200-3203](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L3200-L3203).

### Ground_GetStageGObj

Constructs a new Ground GObj for an unchecked signed map ID. Initializes selected Ground fields, loads archive model data when the ID is below the map count or a dummy hierarchy otherwise, optionally creates an auxiliary camera when flags_b2 and map.x10 permit it, schedules processes at priorities 1 and 4, and replaces the indexed map_gobjs registry slot. Ground_GetMapGObj is the separate registry lookup.

[Canonical lines 817-937](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L817-L937).

### Ground_GetYakumonoParam

Reads `stage_info.yakumono_param` and returns exactly that pointer. Stage initialization callbacks assign the result to a module-local `yakumono_param` before performing their stage flag, object, and shared Ground setup. Provides stage-specific modules with the current stage's opaque yakumono parameter block so they can cache it as part of stage initialization. Performs no state transition, guard, allocation, or mutation; each call immediately snapshots and returns the pointer currently stored in `stage_info.yakumono_param`.

[Canonical lines 2773-2776](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L2773-L2776).

### Ground_OnLoad

Reads `grkind` from the incoming `StageIdPair`, uses it to select one pointer from the global `stage_datas` table, dereferences that stage descriptor, and transfers control to its `on_load` callback. The function does not otherwise transform the pair or produce a return value. Dispatches stage loading to the selected ground implementation by invoking the `on_load` callback in the stage-data descriptor identified by the supplied ground kind. Performs an unconditional single dispatch: it contains no range check for `grkind`, no null check for the selected descriptor or callback, and no alternate branch before invoking `on_load`.

[Canonical lines 688-691](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L688-L691).

### Ground_OnStart

Empty parameterless hook stored in the generic Ground_StageData descriptor; this body performs no initialization.

[Canonical lines 205-205](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L205-L205).

### Ground_SetParamY

Receives a float y value from its caller and writes it into the global stage_info.param object's y field. It produces no return value; if stage_info.param is null, control goes to an assertion instead of performing a write. Sets the y member of the current stage's parameter block, requiring that the parameter block already exist. Permits the update only while the current stage has an allocated parameter block. A missing block is treated as an invalid runtime state and triggers HSD_ASSERT rather than being ignored.

[Canonical lines 310-317](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L310-L317).

### mem_free

Performs an unconditional, branch-free deallocation attempt through `HSD_Free`; it has no null check, ownership guard, timer, local state transition, or recovery path of its own.

[Canonical lines 287-290](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L287-L290).

## Header, Documentation and Naming

The public header declares the API and stage_info. Ground_801C3BA8 has a header declaration but no definition in the owned C. ground.dox retains a stale spline function signature. Three Ground_Init aliases collide globally; no new names are proposed. Source-level declarations do not establish compiled section layouts.

## Detailed Review Notes

# Ground canonical/rendered review notes
Revision c302741689bd67c361cd7faadb221df3193992c3. Owned C3359/H162/dox21. 168 targets/352 subjects. No final packet yet.
Read C1–480 both views completely, helper receipts in campaign pages.
- C142 StageInfo singleton,144–158 fallback descriptor all empty/null hooks. stage_datas160–198 indexed table, NULL holes and many grTe repeats; includes target-family descriptors.
- Ground_OnStart205 no-op; Ground_801BFFAC207 ignores int no-op.
- Ground_801BFFB0 209–270 calls grDatFiles then explicit stage_info resets. Not memset: unassigned fields persist. Clears arrays map_gobjs/x280/x694. camera bounds[-170,170,-60,120], zoom82, maxdepth1000, blast±99999 etc. Ground_Init alias collision with other Ground methods shown.
- zeroBuffer272–278 clears64 bytes; Ground_801C0378 280–285 ignoresarg, ftCo call, allocates64bytes unchecked then zeroBuffer. Old allocation not freed here.
- mem_free287–290 directly HSD_Free.
- GetParamY Ground_801C0498 292–299 returns param.y or1. SetParamY310–317 writes or asserts. Ground_801C0508 319–323 returnsparam.x4 or128.
- Color setters325–377 direct copy at offsets B8,C0,D0,D8,C4,CC,D4,BC,C8 respectively; no guards. Getters379–431 corresponding pointer aliases no guards. Existing visual names not from own accessor body.
- Ground_801C06B8 433–451 unchecked table index but NULL descriptor exits; calls lbDvd withdata1 ifnonNULL, then Izumi/PStadium special helpers.
- Ground_801C0754 453–466 resetsstage, uncheckedpair/table, archivecall(data1,0,stkind!=Heal), BGM helper, copies touch/shadow function pointers, calls5878.
- Ground_801C0800 begins468 (continuation needed): copies parameter fields through local camera setters, param assumednonnull.
- C468–510 Ground_801C0800 config setters, null-terminated itemdata table, ald_yaku_all starts1 null terminated writing shared article scripts unchecked, optional particle bank whenboth pointers, mplib/fog/lights then unguarded on_init.
- C512–575 Ground_801C0A70 optional50% branch checks27 explicit stage kinds; randomslot0–3 withfighter picks player coords,Y=blasttop-5,X+=integer[-50,49],preservesZ; else Stage_80224FDC fallback.
- C584–686 Ground_801C0C2C: if b6/b7 and validP1 not ftLib8701C then scans markers99–B2 orBD–C6 for strict box deltas and optional callback(position,marker), storesfirstmatch/-1 and clearsrequestbit. Missing/ineligiblefighter leavesbits/resultsunchanged. Independent gmflag branch frame>1200 and frame-last>30 updateslast BEFORE positionattempt, then BobOmbRain descriptorhelper ifsuccess.
- C688–691 OnLoad unguarded hook. C693–710 start hook then traverses LIFO deferredlist, savesnext, invokescallback, freesnodes, clearshead; unchecked GObj_Create result scheduledmaintenance10. C712–715 DemoInit unguarded selected hook/int.
- C717–734 enqueue allocatesnode, pusheshead/object/event; failure report+OSPanic.
- C736 no-op1154;738–7511158 dispatch PStadium map1 orCorneria/Venom helper.753–76311AC setsJObj scale1 noGObjguard.
- C765–783 recursive descriptor pre-order index: decrement *depth, returnnode whennegative, childthen sibling.785–80113D0 archive/map upperbound only; depth0 root else recursive; loadjoint evenNULL selection.
- C803–815 get_jobj_inline copiesdummyjoint, sets uniformscale, loads;NULL reports and infinite spin.
- C817–937 Ground_GetStageGObj IS FACTORY, not lookup: GObj_Create failureNULL; uncleared Ground allocationfailure destroysGObj thenNULL; userdata destructor mem_free, initializesselected fields only, sfxslots-1. Materialhelper, assertarchive. map_id upperboundonly: load mapjoint+reference setup, dummy scaledroot usingparamYor1, AddNext. flags_b2 andmapx10 gateauxcamera GObj17,19,0 + lb13B14 + gxlinkmax callback5 prios8 +registry, uncheckedallocations. Attachesroot, passesselected mapjointsto lbF9F8. Out-of-rangepositive map getsdummy allocation branch. Negative IDsunchecked. SchedulesAnim1/1D384; registers mapGObj, returns. Prior dummy nullchecks unreachable due spin.
- C939 begins1A20 customjoint factory; continuation needed.
- C939–987 custom-joint factory guards GObj/Ground allocations, initializes fewer flags, creates suppliedjoint+scaledroot, schedules callbacks; no map registration.
- C989–1000 1CD0 animates, material helper, increments global counter then optional x8_callback. C1002–1008 optional xC_callback.
- C1010–1054 OR stage flags, raw mask getters330/20/100/80, field outputs unchecked, set/get b2.
- C1056–1071 fog render exits camerahelper or !b2, sets fog if object nonNULL. 1073–1076 returns stage fog GObj.
- C1084–1106 foo scans archive map count, first StageCallbacks.flags_b1 selects map.x1C, no sentinel or guards.
- C1108–1138 fog creation unchecked GObj/load, scales start/end by paramYor1, publishes fog and RGB; no desc sets black but does not clear old x12C here.
- C1140–1170 background uses livefog orblack; color setters/getters guard pointers, getter failure leaves output unchanged. C1172–1175 vertical tilt getter.
- C1186 find_light_override scans pointer identity and remaps entry b/a/c to outputs b6/b7/b5; continuation nextpage.
- C1208–1229 override helper uses dat count and array_dat array, pointeridentity, b/a/c remap, no outputwrite onfailure. C1231–1299 asserts nonemptylightset, unchanged if no nonzero matchingoverride anywhere; else only desc flags&3 lights filtered in place, removes nooverride/allfalse, sets4/8/400 from b6/b7/b5. Doesnotfree removedlights. Otherlighttypes retained unchanged.
- C1301–1325 scales available lightposition andinterest byparamYor1 alongnextchain. C1327–1336 archiveassert, returns spline ifunk4 and upperindexbound, no negativeindexguard.
- C1342–1481 BGMresolve findsfirststageparam, derivesbit1/2 underbit4 policy x14, gates somealternate choices by unlock helpers, preserves suppliedbits. Priority10 then20 thennormal; bit1 winsbit2. x10 orx8=-1 fallback normal, alternate resulttrue and stateb0 for20/normal only;10 clearsstateb0. Assert selection !=-1; -2 delegates player0character random2 helper, outputsunchecked. C1483 wrapper.
- C1488–1503 missingparamdiagnostics dumpallstageIDs then infinite loop. C1505–1524 writes35products of signed16 parameterarrays firstmatchingstage; otherwisepanic. C1526 pointerxA0. C1531–1544 intervalscale .01global*.01local firstmatch else report/spin.
- C1546–1554 Ground_GetMapGObj is ACTUAL lookup, pairedstaticsetter, bothunchecked. C1556–1572 cameraregistry dedups includingNULL, firstfreeslot elseassert. C1574–1583 membership scans4 includesNULL. C1585–1593 positionJObj getters/settersunchecked.
- C1595–1640 stageposition: IDs8/9 average4/5 or6/7 ignoringrecursivefailure; uncheckedJObjarraylookup; existingjoint delegatespointtransform. Missing1..3 fallback0,5..7 fallback4,127 tries148 addsY50 else0;4 delegatescamoffset;othersfalse and leavesoutput. C1642–1672 attachesarchivejointtriples thenmatchingdescriptortriples calling552B0/55E9C/57424, enablescollision unconditionally; boolanytriple, noarchiveinner/indexguards.
- C1676–1732 collisionupdate onlybuffer[map]==0; incrementsglobals16stamp, descriptor matchingY updatedwithoutdedup, archive skippedifalready stamp. boolanyupdate. C1734–1769 foreach descriptor matchthenarchiveall; duplicatesnotremoved, callbackunchecked; mpGetGroundCollJoint returnignored.
- C1771–1788 enable onlystate1->0 thenforeachadd; disableonly0->1 thenforeach57BC0; statechanges evennoentries/false return. C1790 snapshotforeach. C1795–1862 forward/reversemapping lastmatchingdescriptor overwritten bylastmatchingarchive; missing-1. Extra mpGetGroundCollJoint callignored. C1866–1899 unusedrawwordstable, interpretationunverified. C1901 referencebinding continuesnextpage.
- C1901–1987 referencebinding nullarchiveexit; nullroot/jointdiagnostic malformed %d __FILE__; findsfirstpointermatchingjoint metadata, traversepreorder skippingINSTANCEchildren, reusescursor fornondecreasingindices andresetsotherwise, writesnullablejobj into unchecked pair1slot. C1989–2042 clearrefs assertsarchive andrequiremetadatajointmatch, scans261slots, walksparentroot, clears matchingrootrefs; nofree.
- C2044–2140 direct camera/blast setters exactfields, no validation/clamping. C2142–2247 camrange markers149/150 bounds sortedrelative148offset, else stage-specificdummydefaults. C2249–2330 deadbounds markers151/152 sortedrelative currentcameraoffset elsedummyperstage. Targetfamilyfallsdefaultifmissingmarkers, no authoredcoursegeometryestablished.
- C2332–2359 requestb6/b7 setters storehalfsizes/callback, returnPREVIOUSmarker result; first setsflag10 andx6D0 ifprevious!=-1 elseclear10; secondsets/clears40 only. Actualquerydeferredmaintenance.
- C2361–2379 firstaobj preorderroot/child/next NULLsafe. C2381 returnsframeelse0. C2390–2423 indexedJObj startsrootchild, depth0firstchild, preorder skipINSTANCEchildren, climbsparents, negativeindexneverreacheszero untiltreeend; gobjunchecked. C2426–2443 successorhelpernonnullprecondition.
- C2445–2464 targets markers199..219 inclusive, nonNULLjoint andnonNULLit8027B5B0(Mato,0,joint,NULL,0) incrementcount; setsbothx6D4/x6D2 evenzero, returnscount. C2466–2480 markers252..259, partiallyinitialized BobOmbRain descriptor x14=20/x4joint/b0true, foreignspawnreturnignored.
- C2482–2488 targetdecrementunchecked; OR0x20 onlyexactzero, noflagclear/no initialzero completion. C2490–2500 getcurrent+delta, setterprev=current thennew. C2502 wrappergrZebes no internals. C2507–2529 archiveentry pointeridentityfirstmatch flagbool; nullarg/emptyfalse;missing nonemptyassert; noarchiveguards.
- C2531–2578 lightanimationBUG: loop animatescur but all position/interest read+write use HEAD lobj. Scales head onlyifbefore/afterdifferent, paramYor1. C2580 wrapper,2585 setslightlist+currentcamera init.
- C2591–2637 staticdefault2lightlists, flags4 andD, whitecolor, direction.57 each and16param, emptyanims/nullterminatedarrays. C2639–2751 scansmapcount for FIRST flags_b0 row, callsfilter onmap.x18, elsedefault2lights; GObj/LObj failure reports+infinite spin. Scalesallpositions/interests, animframe0 rate1, firstlistanimsnonnull gatesall animation-loop pointerlookup, animatesall thenprocess0.
- C2753–2762 first entitylistxC classifierGROUND, no lightkindtest. C2764 returnsfilteredmap_plit ordefaults, canmutate archive list+flags. C2773 returnsparampointer. C2778 clearsfirstmatchingauxobjectregistry.
- C2791–2827 destroy NULLsafe; ifuserdata optionaldestroycallbackfirst, clearsmapregistryonlyidentitymatch, stopsSFX, removesaux, disablescollisionifattachedobj andstate0, clearsrefsifarchive. FinalGObjdestroyalways; mapindicesunchecked. C2829–2880 splineposition+tangenthelper, normalizebasis choosesZ ifabsY>.9 elseY, crossproducts thenasinangles, nearabsvec1z>=.99999 singularbranch, no clamp/zerotangentguard; functionendsnextpage.
- C2883–2918 barreltransformstore/getuncheckedptrs truealways, two stage-kinddispatchers Kongo/OldKongo only, otherkindstruewithoutaction, helperinternalsunverified. C2920–2937 setb3 before sixpointtransform/store calls.
- C2939–2956 MUST_MATCH sqrt helperpositive frsqrte3Newtonsteps volatilefloatstore, otherwiseinputunchanged; alternatebuildsqrtf. C2962–3063 fogonlyifb3; xsign selectsleft/rightpointpair,znegative blendsfrontpair withnormalizedabsoluteXZweights, else uses sidepair. Eyedistance start/end min5/10, ifstart>end setsend=start+1, equalunchanged. FogGObj/objectguards; nocameraguard.
- C3067–3075 audio wrappers fixed127/64, secondforwardsfourtharg. C3079–3099 slotrange0..7/gpguard;540000noop,540001stop, otherIDstopold thenstore newaudiohandle. C3101 validrange/nonNULL/nonminus1 andhelpertrue. C3112–3125 stopoldifpresent thenassign-1. C3127 all8. C3137/3147 guardedhandlevolume127*val, pan63.5*(val+1), nounitclamping.
- C3157–3163 optionaltouchlinecallbackelseNULL. C3165–3193 directstatus/x6DC/x740getsets. C3195–3203 player0entity andindex1helper returns. C3208 ignoresarg returnsx6E0;callercommentunverified.
- C3213–3220 paramnonnull selectsCameraFixed/Standard. C3222–3226 callsRandi1 thenx6E4index. C3233–3246 tyinithelper then1Pselect/load/store else-1. C3251–3260 positionreturnignored, spawnthenToynotificationunconditional evenNULLspawn, returnsnullableitem.
- C3270–3304 archivejointreferencepair bvalues220..251, collectsfirst32 includingduplicates, noentry=>-1 ornomatch=>-1; returnsrandomstoredMARKER notkind. C3306/3313 opaqueToyhelpersequences;3320–3335 x98/b1setget;3338–3341 uncheckedstageflags2getter. C3343–3355 Eulerhelper thenzeroeachcomponent failingabs<30000 includingNaN/infinity. C3358 unused9intsopaque.
- H1–162 readbothviewsEOF. Prototypes mostlymatchC; H103 Ground801C3BA8 declaredwithoutCdefinition, noKBidentity; dox10 stale s32,s32 vs H122/C2829 HSD_Spline*,Vec3*; dox13–18 unpausebehaviorclaimneedsforeigncallerproof. doxall21readbothEOF.
- Supporting frozen src search for .callback1 or ->callback1 finds onlyunrelatedlbrefractwrites; no namedStageCallbacks.callback1 consumption. Ground/inlines/types search confirms onlyb2factory,b1fog,b0lights. This is boundedabsence evidence, not proofcallbackneverused viaoffset/otheralias.

