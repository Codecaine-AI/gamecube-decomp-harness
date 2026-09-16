# Disjoint Librarian Research

### shard-main__melee__ft__fighter-000
Reviewed canonical and rendered `src/melee/ft/fighter.c` lines 1–480 only.

- Defines fighter allocation pools and common-data pointers. `Fighter_800679B0` initializes pools, invokes supporting initialization routines, loads common data, sets the counter aliased as `g_spawnNumCounter` to 1, and invokes each non-null entry in `ftData_Table_Unk1`. `Fighter_FirstInitialize_80067A84` additionally initializes a pool with size 0x8000 and alignment 0x20.
- `Fighter_LoadCommonData` loads `ftLoadCommonData` from `PlCo.dat` and distributes 23 pointer entries into explicitly named globals.
- `Fighter_UpdateModelScale` applies the common model scale to the joint's Y and Z axes; X uses `fp->x34_scale.z` when that value differs from 1, otherwise the common scale.
- The assigned beginning of `Fighter_UnkInitReset_80067C98` obtains a spawn value, loads player coordinates and facing, adds a facing-dependent X offset, and synchronizes current and previous position. It initializes numerous flags, counters, references, damage-related values, and callbacks; damage percent comes from `Player_GetDamage`, while shield health comes from common data. The visible portion also clears reflecting and metal state. This function continues beyond the shard boundary.

### shard-main__melee__ft__fighter-001
Reviewed canonical and rendered fighter.c lines 481–960 only.

- The reset tail initializes flags, timers and sentinels. Fighter_UnkProcessDeath_80068354 orchestrates reset helpers, position/model updates, a conditional per-kind OnDeath callback, CPU-parameter setup and asynchronous queue clearing. Fighter_Create also invokes this routine, so it is not exclusively a death-event entry point.
- Costume setup selects the kind/costume joint, loads it under a temporary default class and attaches it to the object. Bone-derived setup stores bone-index-2 translation Y divided by 8.55 and a difference between two helper-produced bone vectors.
- Both input-reset implementations clear two input samples and button transitions, setting timer groups to 0xFE and 0xFF. Initial load additionally clears sample index 2, copies allocation/player configuration, calculates alpha-scaled player RGB for nonzero controller indices, falls back to costume zero when the requested index reaches the costume count, selects data/state tables and initializes flags.
- The spawn-number helper returns the pre-increment counter and changes a wrapped next counter from zero to one. Stage scaling selects the common-data Z scale for Gr_Kind_Flatzone and 1 otherwise.
- Fighter_Create allocates fighter and backup-attribute storage, installs user-data cleanup, sequences resource/model initialization, calls the optional per-kind OnLoad hook, registers processing callbacks, runs the shared reset routine and selects an initial branch from kind, transformation and player flags.
- The visible motion-change prefix writes motion ID and facing snapshot, updates root translation, flushes the asynchronous queue and conditionally invokes two hit-related helpers unless Ft_MF_SkipHit is set.

### shard-main__melee__ft__fighter-002
Reviewed canonical and rendered fighter.c lines 961–1440 only. The transition-code continuation performs flag-controlled cleanup alongside unconditional resets of damage, reflection, visibility and other transient fields. It conditionally clears fast-fall and removes the accessory joint tree. Grounded fighters receive additional resets, including setting Peach's has_float and clearing used_tether. The code selects a motion-state descriptor from one of two tables, invokes and clears a pending callback, initializes animation timing, and selects animation metadata from either the fighter or an optional other fighter. Animation setup handles freezing, blending, command-script initialization, joint transforms and conditional conversion of animation offsets into grounded horizontal velocity. It then installs the descriptor's five primary callbacks and clears auxiliary callbacks. The opening of Fighter_8006A1BC decrements two damage-related timers under a guard, dispatches conditional expiration handling, clears allow_sdi when the hitlag-frame timer expires, and drains queued mushroom-application counters.

### shard-main__melee__ft__fighter-003
Reviewed canonical and rendered fighter.c lines 1441–1920 only.

- `Fighter_8006A360` performs flag-gated update work: records positional displacement, advances status and item timers, dispatches expiration handlers, applies periodic damage calls, and decrements damage percentage during an active recovery counter. Two status-expiration branches return early, skipping subsequent work. Kind-specific and instance callbacks run before a separately gated animation/counter-update block; final helper calls remain outside that inner gate.
- `Fighter_8006ABA0` conditionally dispatches `ftCo_800B3900` when the outer disable flag is clear and `ftCo_800A2040` succeeds.
- `Fighter_UnkIncrementCounters_8006ABEC` resets five counters on their respective input predicates, otherwise saturating them at 255. The first two also preserve the previous counter value on reset.
- The input helper computes button press/release edges between slots 0 and 1, accumulating rather than replacing edges when `x2219_b5` is set.
- The reviewed prefix of `Fighter_Spaghetti_8006AD10` preserves input history, selects CPU-getter or pad-status input, takes the larger analog trigger value, applies stick/trigger deadzones, conditionally suppresses C-stick input, filters or synthesizes button bits, and invokes edge detection. It then begins counter updates capped at 254; the function continues beyond this shard.

### shard-main__melee__ft__fighter-004
### Assigned source: fighter.c, lines 1921–2400
- The input-processing continuation maintains stick and analog-trigger threshold counters with saturation at `0xFE`, resets counters on threshold entry, and records stick direction flags. Button-press age counters saturate at `0xFF`; A and L/R presses also preserve preceding counter values. Conditional input snapshot copying precedes gated helper calls and the optional input callback.
- `Fighter_procUpdate` returns immediately for `x221F_b3`. Its `!x2219_b5` branch decrements nonzero cooldown/capture counters, invokes a helper and optional physics callback, and updates ordinary and attacker-shield knockback. Airborne ordinary knockback uses either helper-based component updates or constant-magnitude vector decay; grounded knockback is reconstructed along the floor tangent after a friction-parameterized helper call.
- The airborne shield-knockback low-magnitude branch explicitly clears shield-knockback X and **ordinary knockback Y**, leaving shield-knockback Y untouched. This cross-vector assignment is directly observable, independently of the source comment's glitch attribution.
- Motion integration consumes ground accelerations and animation velocity, optionally interpolates local XY self velocity, applies an X/Z nudge, and either accumulates self/ordinary-knockback displacement for conditional release or applies it immediately. Shield knockback is added in both paths.
- Wind collection is skipped and its vector cleared when `x2219_b5` is set. Subsequent helper/callback execution, conditional floor displacement, and wind application occur outside that gate. The assigned range ends at the opening of another conditional, not at the end of the update function.

### shard-main__melee__ft__fighter-005
Reviewed canonical and rendered fighter.c lines 2401–2880 only.

- The update tail handles vertical threshold crossings, conditionally clears knockback magnitude, calls collision maintenance, and checks for NaN positions in debug builds.
- Model transformation builds a correction matrix using the inverse current joint matrix and an SRT matrix with a replaced X scale. Map processing decrements the ECB lock, invokes collision callbacks, and synchronizes joint translation. Accessory callbacks select either callback 3 or callbacks 2 then 1 according to x2219_b5; later processing flushes asynchronous effects, invokes callback 4 outside that state, animates an accessory joint, and conditionally lowers a camera-related Y value.
- Grab processing prioritizes a fighter victim over an item target, conditionally plays sound, and dispatches the corresponding callbacks. A separate gated routine sequences collision-related calls and forwards a positive result to ftCommon_8007FC7C.
- Damage accumulation is flag-gated, reduces active auxiliary health pools, caps percent at 999, and reports the resulting value to player routines. Additional helpers perform randomized item operations under motion/element/flag restrictions and accumulate x18F0 with two notification calls.
- Hitlag helpers invoke pre/post callbacks, toggle x2219_b5, and coordinate a linked fighter through x1A5C and x2219_b7. The visible beginning of hit processing regenerates or drains shield health, handles negative shield health, expires a damage timer, applies pending damage, and begins knockback-reaction dispatch.

### shard-main__melee__ft__fighter-006
Reviewed canonical and rendered fighter.c lines 2881–3123 only.

- The opening continuation dispatches pending damage/contact conditions through an ordered branch chain, including optional shield-hit, damage-dealt, reflection, absorption, and hurtbox-detection callbacks. Pending temporary damage is passed to the damage helper when forceAppliedOnHit is false.
- A nonzero selected damage value drives hitlag calculation. The result is raised to x1964, then, if positive, capped by the common-data limit; the code enables allow_sdi, updates branch-dependent flags, and conditionally calls Fighter_UnkRecursiveFunc_8006D044. Separate pending flags/timers can trigger the same helper. A pending shield-contact value produces signed ground-attacker shield velocity. The routine then clears accumulated damage/contact fields and restores hitlag modifiers to defaults.
- Fighter_8006D9AC conditionally delegates to ftCo_8009E0A8. Fighter_UnkCallCameraCallback_8006D9EC runs a common helper followed by an optional camera callback. Fighter_8006DA4C forwards player identity, position, previous position, and facing information to player-related helpers. These wrappers are gated by fighter flags.
- Fighter_Unload_8006DABC invokes an optional kind-specific removal callback, calls subsystem cleanup helpers, clears the asynchronous effect queue, unloads dynamic bones, removes joint/light resources, and frees auxiliary allocations before freeing the fighter itself.

### shard-main__melee__ft__fighter-007
Reviewed canonical and rendered `src/melee/ft/fighter.h` lines 1–194 only. This declaration-only header exposes the fighter module's function interface and shared data declarations. The interface includes creation, motion-state changes, processing callbacks, damage-related entry points, and unloading; it does not establish their implementation behavior. `Fighter_ChangeMotionState` accepts a fighter object, motion ID, flags, three animation floats, and another fighter-object pointer. Shared declarations include six object-allocation descriptors, joint and opaque data pointers, a heterogeneous pointer-table structure, float parameter structures, two pointers sharing a shake-table structure, parts tables, and common fighter data. Gameplay meanings attached to unnamed fields remain comment-level hypotheses.

### shard-main__melee__ft__fighter-008
Reviewed the complete assigned canonical and rendered range, `src/melee/ft/fighter.dox:1–91`. This is a guarded declaration surface, not executable implementation. It declares common-data and parts-table pointers, partially typed external globals, six object-allocation descriptors, and fighter function prototypes. The interface includes a creation function returning `Fighter_GObj*`, a motion-state entry point accepting a motion ID, flags, three animation floats and another fighter-object pointer, and an unload entry point accepting `void*`. No function bodies, state transitions, allocation operations, or gameplay mappings are established by this range.

### shard-main__melee__ft__fighter-009-retry185815-retry190639
Reviewed the six assigned data-section subjects, not the complete translation unit. Current source establishes six fighter allocation descriptors, publication of 23 common-archive pointers, a spawn counter with zero-wrap repair, two zero-vector item-release templates, diagnostic strings, and scalar constants used by fighter calculations. Source-level behavior is distinguishable from compiled section placement, sizes, ordering, and literal pooling; those layout claims remain unverified.

### shard-main__melee__ft__fighter-010
Reviewed the six assigned subjects, not the complete translation unit. They initialize shared fighter pools and common state, establish stage-selected Z scale, coordinate damage timers and queued applications, update temporary status and animation state, dispatch eligible CPU processing, and schedule grounded pose adjustment. Current code exposes several baseline overstatements concerning call ordering, counter-reset conditions, compiled sizes, and gameplay interpretation.

### shard-main__melee__ft__fighter-011
Reviewed the six assigned fighter functions and their relevant registration, damage, pickup, attachment, and hitlag paths. The routines perform guarded late accessory/effect maintenance and camera-relative minimum tracking; dispatch an ordered collision pipeline with a positive-result handoff; probabilistically drop eligible held and attached items after damage; accumulate an item-supplied recovery value and request feedback; and coordinate direct or propagated hitlag exit. The propagated-exit marker is consumed even when SDI or a remaining timer prevents immediate exit. This review does not establish complete translation-unit coverage.

### shard-main__melee__ft__fighter-012
Reviewed the six assigned subjects. They initialize shared fighter resources and pools, construct and schedule fighter objects, enter motion states, dispatch accessory callbacks, update dynamic bones, and publish fighter pose and statistics to player records. The constructor's final ftLib_800867E8 call resets input and sets x221D_b4; it is not fighter-library registration. Motion entry's freeze handling is conditional on a valid animation ID, and its accessory callback cleanup explicitly clears slots 1 and 4 rather than every accessory slot.

### shard-main__melee__ft__fighter-013
Reviewed the six assigned function subjects, not the complete translation unit. Common-data initialization publishes 23 archive pointers. Spawn bookkeeping issues incrementing serials while skipping wrapped zero. Input reset installs neutral samples and sentinel timers; scheduled input processing samples controllers, filters analog values, derives button edges, tracks timing, and conditionally dispatches input callbacks. Hit processing resolves prioritized combat results, shield changes, hitlag and recoil, then clears transient results. Damage accounting updates percentage and conditional health pools and synchronizes player state.

### shard-main__melee__ft__fighter-014
Reviewed the six assigned functions and all 35 baseline facts. These functions initialize player-derived Fighter configuration, reset reusable runtime state, orchestrate model/collision/callback restoration, construct a guarded root-scale correction matrix, maintain saturating command-age counters, and prepare transient shifts before optional camera-callback dispatch. The review distinguishes direct field updates from behavior delegated to helpers; it does not claim complete translation-unit coverage.

### shard-main__melee__ft__fighter-015
Reviewed the six assigned subjects and their 34 baseline facts, not the complete translation unit. The routines dispatch fighter-first grab contacts, enter and propagate hitlag, latch a linked-state cleanup flag, sequence damage bookkeeping and a separately guarded item-generation helper, instantiate costume joint hierarchies, and cache model measurements used by fighter positioning. Detailed item-acquisition and Coin Battle interpretations remain deferred where the inspected call boundaries do not establish them.

### shard-main__melee__ft__fighter-016
The reviewed subjects cover pooled Fighter destruction, root-model scaling, scheduled physics integration and map processing, and shared runtime lifecycle orchestration. Destruction releases auxiliary allocations before the Fighter itself. Scaling combines runtime and character attributes with an optional X override. Physics integrates motion and environmental displacement; map processing brackets collision callbacks with model-position synchronization. Shared initialization, creation, death reset, timers, and motion transitions connect these phases. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__fighter-017
The entire bounded subjects bundle was read. All six assigned parameter subjects have empty baseline fact arrays, so there are no fact IDs to assess. No new semantic claims or proposals are made; this result does not establish parameter functionality or full translation-unit coverage.

### shard-main__melee__ft__fighter-018
The six assigned parameter subjects contain no baseline facts. Their current source functions take a Fighter pointer and integer argument (Fighter_8006CDA4 and Fighter_8006CF5C), or a Fighter_GObj pointer (Fighter_8006CFE0 and Fighter_8006D10C). Fighter_8006CDA4 uses its integer argument as a random-comparison threshold in conditionally invoking item operations. Fighter_8006CF5C conditionally adds its integer argument to dmg.x18F0 and calls two helpers. Fighter_8006CFE0 conditionally invokes Fighter_8006D10C before clearing x2219_b7. Fighter_8006D10C invokes an optional post_hitlag_cb, clears x2219_b5, and conditionally propagates processing through x1A5C. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__ft__fighter-019
The complete bundle contains six parameter subjects and no baseline facts. Canonical declarations expose fighter-object inputs and motion-state selection, flags, and animation controls. The inspected Fighter_8006D9AC body conditionally forwards its fighter object to ftCo_8009E0A8; Fighter_8006DA4C conditionally passes fighter position, facing, and player identifiers to downstream routines. No register-to-source-parameter mapping is asserted.

### shard-main__melee__ft__fighter-020
This bounded subject shard contains six register-labeled parameter identities and no baseline facts. There are therefore no fact records to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted.

### shard-main__melee__ft__fighter-021
The fully read bundle assigns six parameter subjects, each with an empty baseline fact list. There are therefore no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic or register-layout assertions are proposed; this result does not establish function-body or whole-TU coverage.

### shard-main__melee__ft__fighter-022
The bundle assigns six parameter subjects across five fighter functions. All six subjects have empty baseline fact arrays, so there are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic facts or links are proposed.

### shard-main__melee__ft__fighter-023
The complete bundle assigns six parameter subjects, all with empty baseline fact arrays. There are consequently no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter naming, typing, register mapping, or gameplay assertions are proposed.

### shard-main__melee__ft__fighter-024
The entire assigned bundle contains four parameter subjects, each with an empty baseline facts array. There are therefore no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled register mappings are asserted, and no complete translation-unit coverage is claimed.

### shard-main__melee__ft__fighter-025-retry190639
The reviewed fighter code initializes player-specific scale and costume state, constructs the costume model, and schedules distinct input, physics, collision, accessory, and player-state callbacks. Input processing copies controller state, applies deadzones and mappings, and maintains timing counters. Other reviewed branches drain mushroom requests, dispatch Hammer maintenance, expire ECB locks, track camera-adjusted minimum height, and contain the explicitly documented invisible-ceiling knockback error. This review covers the assigned links, not the entire translation unit.

### shard-main__melee__ft__fighter-026
Reviewed the twelve assigned links against current canonical fighter source. The inspected code supports death/reset coordination, linked hitlag transitions, knockback integration, table-driven motion descriptors and callbacks, scale-correction matrices, Metal expiration, and magnification-conditioned damage. External subsystem interpretations and compiled-section attribution remain explicitly deferred; this is not complete translation-unit coverage.

### shard-main__melee__ft__fighter-027
The reviewed links cover fighter construction, costume and scale initialization, motion transitions, scheduled collision and hitlag processing, damage accounting, and respawn reset integration. Current code supports these relationships. The flower identity of the timed attachment and the sound semantics of the deferred hitlag call remain unverified. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__ft__fighter-028
Reviewed the twelve assigned concept links against current canonical code. The routines participate in fighter initialization and spawn bookkeeping, hitlag entry, grab callback dispatch, timed mushroom processing, accessory animation, dynamic-bone updates, stage-dependent depth scaling, and input-age tracking. Two item-specific mappings remain unverified. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__fighter-029
Reviewed the twelve assigned concept links against current canonical code. Supported behavior includes knockback processing, hitlag entry and linked-fighter exit, grounded IK delegation, stage-dependent scaling, model hierarchy construction, mushroom expiration, environmental displacement, and post-death reset. Item-contact dispatch and damage-dependent attachment removal are visible, but their specific pickup and Bunny Hood mappings remain deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__fighter-030
Reviewed the five assigned links only. Current fighter code directly supports damage-percentage accumulation with a 999 cap, model-root scaling, and shield-health regeneration, damage, exhaustion detection, and callback dispatch. Constructor branch selection is confirmed, but its Entry-state interpretation remains deferred. Spawn-counter behavior is supported at source level; ownership by the compiled .sbss section is not established.

Status: researched; no-change lead bypass; independent review and live promotion pending.
