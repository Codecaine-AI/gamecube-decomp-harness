# Disjoint Librarian Research

### shard-main__melee__gr__grmutecity-000
Reviewed canonical and rendered grmutecity.c lines 1–480, plus the initializer's continuation through line 495; this is not complete TU coverage.

The range defines the Mute City stage descriptor, resource path, joint table and sparse 39-entry callback table. Stage initialization stores the yakumono parameter pointer, clears two stage flags and configures stage objects 0 and 30. The object-setup helper obtains an object by ID, clears two callbacks, installs its display link, conditionally installs callback3, invokes initialization and registers the process callback; failure is reported and NULL returned. Two lifecycle functions are empty, another calls grZakoGenerator_801CAE04(NULL), and the boolean hook returns false.

The object-30 initializer initializes local state, requires two splines identified by diagnostics as left/right car splines, caches camera and blast-zone bounds relative to a camera offset, configures subordinate objects 29 and 2, calls material setup routines and registers fn_801F2B58 for collision joint 4. Its continuation hides each point light encountered and retains the last matching light pointer.

### shard-main__melee__gr__grmutecity-001
Reviewed canonical and rendered grmutecity.c lines 481–960 only.

- The opening initialization tail saves encountered point lights and hides them. grMuteCity_801F0120 refreshes stored-light distance attenuation, runs the command processor and other updates, and conditionally calls grMuteCity_801F0D20 when xD0_flags.b0 is set.
- grMuteCity_801F01B4 initializes animation-related state and a stored joint reference. grMuteCity_801F0290 moves mutecity2.xD0 toward xCC by at most 0.001 per call, multiplies the joint's current Z rotation by that value, then invokes two update helpers. Several adjacent callbacks are empty or always return false. grMuteCity_801F044C passes a model-index table and count 0x1C to grFZeroCar_801CAFBC, invokes another initializer, and clears xC4.
- grMc_803E34E0 is a sequential frame/command/parameter/float script. grMuteCity_801F04B8 consumes eligible entries using xC4 as its cursor. A positive xC6 is decremented with immediate return; command 1 loads that delay and ends the current processing pass. A helper condition resets the cursor and requests animation frame 1 on the associated object. The cursor wraps at 0x84.
- Implemented commands issue animation and joint-list calls, set global and per-object flags, hide/show joint subtrees, update paired float fields, change or restore values through Ground setters, invoke material/audio/notification helpers, and toggle stored-light visibility. Command 22 writes the associated object's xCC target consumed by grMuteCity_801F0290. Table command 10 has no switch case and therefore only advances the cursor. The assigned range ends at the declarations opening a spline helper; its behavior is not established here.

### shard-main__melee__gr__grmutecity-002
Reviewed canonical and rendered grmutecity.c lines 961–1440 only.

- The spline-evaluation tail bridges the parameter seam by linear interpolation between samples at 0.93 and 0.01. grMuteCity_801F094C walks wrapped parameters in increments of magnitude 0.0004 until successive transformed samples no longer have strictly same-sign Z; it returns the current sample and parameter, not an interpolated exact zero.
- grMuteCity_801F0D20 obtains two such samples, stores them in ground state, and updates collision lines 0x31 and 0x35 with mode-dependent endpoint geometry. Line 0x33 spans the central 35–65% of the segment between samples.
- grMuteCity_801F0F4C initializes 30 entries from paired parameter values and alternating 0.37/0.87 values, clears auxiliary state, and initializes an identity index array.
- grMuteCity_801F1328 orders indices by descending x0, clears interaction flags, compares eligible entries using wrapped x4 separation and squared spatial distance, sets relative-xC and proximity flags, marks the first and last five indices, then calls grMuteCity_801F106C for every entry. That updater adjusts x8 and xC using flags, randomness, and configured increments/caps; its b0 branch instead applies parameter-dependent minimum movement or decay.
- Thirty small functions each add their argument to a distinct entry's x10. The assigned range also contains a callback that calls Ground_801C53EC with 0x5CC60 and the beginning of the accumulator-function pointer table.

### shard-main__melee__gr__grmutecity-003
Reviewed canonical and rendered grmutecity.c lines 1441–1920, with lines 1921–1923 read to finish the final function; this is not complete TU coverage.

- `grMuteCity_801F1A34` updates 30 car records and corresponding sibling joints. It advances progress, wraps the spline parameter once above 1, samples two splines with interpolation across their seam, constructs an orientation basis, and positions each car between the sampled points with a three-unit normal offset.
- The same loop gates effects and sound-related calls using flags, a shared cooldown, distance, and position. Thresholds on record field `x10` trigger an intermediate attached generator or a one-time model replacement and state-bit transition. Nearby non-transitioned cars acquire configured item objects with callbacks; leaving the bounds removes those objects. Transitioned cars separately gate an attached generator by camera/depth bounds. Nearby cars also request looping camera quake and latch a one-shot sound selection.
- `grMuteCity_801F28A8` obtains archive 38, asserts it exists, and returns a `DynamicModelDesc*` at `dat->unk8 + 0x7B8` when the nested data exists, otherwise NULL.
- `grMuteCity_801F290C` temporarily replaces colors of up to four lights whose flags include bit 4 on the first classifier-0xC object in the selected entity list. It saves colors once while its predicate is zero and restores them when the predicate becomes nonzero, tracking the override with a bit.
- `grMuteCity_801F2AB0` requests a generator, ensures an application SRT exists, assigns uniform scale from `Ground_801C0498`, adjusts generator flags, and links the SRT back to the generator. Its declared integer return is not supplied by the current source.

### shard-main__melee__gr__grmutecity-004
Reviewed canonical and rendered lines 1921–2015 only, not the complete translation unit.

- The opening fragment assigns `gen` to `appsrt->gp`.
- `fn_801F2B58` sets collision flag `b7` only when `grMc_804D69D4 == 1`, collision field `b1234` is 2, 3, or 5, ground kind is `mpLib_GroundEnum_Unk2`, and the associated object is non-null with `p_link == 9`. Other cases return without that write.
- `grMuteCity_801F2BBC` selects a dynamics descriptor only in global state 1: arguments 0x31 and 0x35 return `yakumono_param->x8`; 0x32–0x34 return `yakumono_param->xC`; all other cases return null.
- `grMuteCity_801F2C10` applies a position test when map object 0x1E has ground data and the supplied joint matches one of five stored pointers. It rejects x coordinates outside the inclusive endpoint interval, then accepts only positions strictly above the interpolated endpoint line minus 3.0. Missing map/ground data or an unmatched joint defaults to true. The interpolation has no explicit zero-width guard.

### shard-main__melee__gr__grmutecity-005
Reviewed the complete assigned header, `src/melee/gr/grmutecity.h:1–81`, in canonical and rendered views. It declares the module interface: object-oriented entry points taking `Ground_GObj*` or `HSD_GObj*`, a joint/spline/vector helper returning `f32`, thirty single-`float` void functions, descriptor-returning functions, and the external `StageData grMc_StageData`. This range contains declarations only; it establishes source-level signatures, not callback registration, runtime behavior, gameplay meanings, or compiled layouts.

### shard-main__melee__gr__grmutecity-006
The assigned header range defines `grMc_CarEntry`, containing eight `f32` fields, one `u16`, a nested structure with two one-bit `u8` fields, one additional `u8`, and two `s32` fields. It asserts a size of `0x2C` and declares the static 30-element array `grMc_8049F4B8`. This range provides data declarations, not executable behavior; field meanings and runtime use are not established here.

### shard-main__melee__gr__grmutecity-007-retry191012
The assigned data subjects support Mute City's stage descriptor and indexed callbacks, thirty persistent car records and their ordering, replacement-model positioning, and a timeline-controlled collision/dynamics gate. Current source confirms these functional relationships, but does not independently establish compiled section extents or membership. Several baseline descriptions also conflate lateral interpolation with speed and an externally accumulated field with age. This review is limited to the assigned subjects, not complete TU coverage.

### shard-main__melee__gr__grmutecity-008
Reviewed the six assigned subjects, not the entire translation unit. The joint-4 callback conditionally sets collision flag b7 after mode, contact-state, ground-kind, and owner-link checks. The stage descriptor installs empty demo-init and load hooks, an initializer that caches parameters and initializes ground objects and a hidden interface model, a start hook that constructs the shared generator manager with NULL descriptors, and an invariant false predicate.

### shard-main__melee__gr__grmutecity-009-retry191012
The assigned functions implement Mute City's indexed Ground-object setup, the main component's initialization and recurring orchestration, two inert lifecycle hooks, and initialization of its animated subordinate component. The canonical callback table assigns the main controller to object 30 and the subordinate component to object 29. Main initialization retains spline joints, relative bounds, child objects and a point light; recurring processing dispatches commands, conditionally updates spline-derived collision, and updates racer state and transforms. The subordinate component retains joint 6 and initializes rotation controls. Corrections distinguish object 30 from 29 and animation-category mask 7 from an animation index. This review covers the assigned subjects, not the entire translation unit.

### shard-main__melee__gr__grmutecity-010
Reviewed the six assigned functions and their 33 baseline facts. The component at callback-table index 29 has a constant-false predicate, a recurring process that approaches a controller-supplied rotation multiplier in 0.001 increments and invokes lighting/collision maintenance, and an empty callback3. Components 36 and 37 share archive-backed animation initialization, a constant-false predicate, and an empty recurring process. The baseline incorrectly assigns grMuteCity_801F040C to component 28; its actual table index is 29. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__grmutecity-011
Reviewed the six assigned subjects, not the complete translation unit. The shared callback3 for entries 36/37 is empty. Entry 2 initializes a thirty-model group and thirty runtime records; its predicate always returns false and its process and callback3 bodies are empty. The command interpreter consumes frame-keyed records, preserves a delay and cursor, dispatches state changes and subsystem calls, and wraps the cursor at 132 entries. Detailed gameplay interpretations of those calls remain partly unverified.

### shard-main__melee__gr__grmutecity-012
Reviewed the six assigned subjects and their baseline facts. The code contains an empty update hook, a cyclic fixed-step spline Z-crossing search, mode-dependent collision-line reconstruction, thirty-record initialization, per-record motion policy, and pack ordering/proximity analysis. The downstream placement code distinguishes forward progress (`x8`) from lateral spline interpolation (`xC`). This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__grmutecity-013-retry191547
The six assigned functions add a floating-point argument to records 0–5 of the shared damage accumulator array. Their ordered table entries are installed as material-proxy damage callbacks. Initialization clears the totals; recurring processing checks x30 first to replace the model, remove its proxy, and set a destruction flag, otherwise checking x2C to attach an effect. These are deferred transitions, not work performed by the accumulator callbacks. This review covers only the assigned subjects and supporting source.

### shard-main__melee__gr__grmutecity-014-retry191012-retry191547
The six assigned functions are branchless `void(f32)` accumulators for records 6–11, occupying the corresponding entries of a 30-entry callback table. Material-proxy registration selects the callback by record index. Shared processing checks `x10 > x30` first and performs guarded attachment replacement and proxy removal; otherwise, `x10 > x2C` can create an attached effect. Initialization clears the accumulators and related state. Neither strictly increasing totals nor an obligatory effect-before-replacement sequence follows from these bodies.

### shard-main__melee__gr__grmutecity-015
The six assigned functions are fixed-index damage accumulators for slots 12–17. Each adds its float argument to the corresponding record's x10 and occupies the matching entry in a 30-entry callback table. The controller registers these callbacks with item proxies and consumes x10 through two threshold branches: the upper threshold takes precedence, replaces the child model, removes the proxy, and sets a disabling flag; otherwise the lower threshold can create an attached effect. The leaves themselves neither clamp inputs nor perform transitions.

### shard-main__melee__gr__grmutecity-016
The six assigned functions add their scalar argument to `grMc_8049F4B8[18..23].x10`, respectively, without local guards or clamping. Their corresponding entries in the 30-entry callback table are registered with temporary item proxies. The item damage-received dispatcher supplies `xCA0` through the wider callback interface. The shared controller tests the accumulated value against `x30` first, performing guarded effect cleanup, child-model replacement, proxy removal, and disablement; otherwise, above `x2C`, it creates an attached effect if its handle is absent. This review covers the assigned subjects and supporting paths, not the entire TU.

### shard-main__melee__gr__grmutecity-017
The six assigned callbacks unconditionally add one floating-point argument to entries 24–29 of the shared accumulator array. Their ordered table entries are selected when creating model-attached interaction items. Item damage dispatch supplies the received-damage scalar. Shared processing, rather than these leaf callbacks, performs threshold-dependent effects, model replacement, proxy removal, and a persistent state-flag transition.

### shard-main__melee__gr__grmutecity-018
Reviewed the six assigned subjects and their 36 baseline facts, not the entire translation unit. The code supplies a fixed sound request for racer-proxy damage events; updates thirty spline-driven models and their proximity, interaction, and replacement effects; retrieves an archive-backed UI model descriptor; saves, overrides, and restores selected light colors; configures attached particle generators; and selects collision-line dynamics descriptors under a mode guard. The particle helper's declared non-void result lacks an explicit value return, so its callers' stored results do not establish a valid generator-handle contract.

### shard-main__melee__gr__grmutecity-019
Mute City's stage descriptor dispatches Ground initialization and recurring updates. Stage-owned state supplies spline geometry, collision endpoints, camera bounds, joints and lighting; a frame-keyed command stream coordinates stage transitions. Thirty racer records drive spline-based placement and proximity-dependent behavior. The shadow callback is read-only: five stored joint references receive an inclusive horizontal-range check and a strict height check against the interpolated endpoint line minus 3; other references and missing stage payloads are approved. This review covers the assigned baseline subjects, not the entire translation unit.

### shard-main__melee__gr__grmutecity-020
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions. Current source shows an unused boolean argument in an empty function, a stage-object ID used for object lookup and callback setup, an object pointer used to initialize stage state and register a collision callback, and an unused object argument in a constant-false callback. The collision callback conditionally sets a collision flag after checking global state, collision flags, ground kind, and the attached object's link value. Register-labelled parameter identities are not promoted to source-parameter mappings without ABI evidence. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__gr__grmutecity-021
The six assigned parameter subjects have no baseline facts. Their current function definitions each take a `Ground_GObj*`. `grMuteCity_801F0120` uses that object to access ground state, update optional light attenuation, and dispatch several updates. `grMuteCity_801F01B4` initializes object animation and ground state, stores a joint pointer, and zeros two scalar fields and a flag. `grMuteCity_801F0290` moves one scalar toward its target by at most 0.001 per call, multiplies the stored joint's Z rotation by that scalar, and forwards the object to two update functions. `grMuteCity_801F01B0` and `grMuteCity_801F040C` ignore their parameters in empty bodies; `grMuteCity_801F0288` ignores its parameter and returns false.

### shard-main__melee__gr__grmutecity-022
The six assigned parameter subjects have no baseline facts. Their current functions declare a single Ground_GObj* parameter. grMuteCity_801F0410 obtains ground data from that object and passes the object and its map_id to grAnime_801C8138. grMuteCity_801F044C passes its object to two helpers and clears ground field u.mutecity.xC4. grMuteCity_801F043C and grMuteCity_801F04A8 ignore their parameters and return false; grMuteCity_801F0444 and grMuteCity_801F0448 are empty. Review is limited to this bounded subject shard.

### shard-main__melee__gr__grmutecity-023
The six assigned parameter subjects contain no baseline facts. Canonical source shows unused Ground_GObj* arguments in the empty functions grMuteCity_801F04B0, grMuteCity_801F04B4, and grMuteCity_801F0948. grMuteCity_801F04B8 takes a Ground_GObj*, obtains its joint and ground state, and processes frame-gated commands with a countdown and wrapping command index. grMuteCity_801F094C takes an HSD_JObj* and HSD_Spline* as its first two arguments; it samples the spline, passes samples and the joint to lb_8000B1CC, and steps the wrapped spline parameter until successive resulting z values no longer have the same strict sign. Its caller supplies each joint together with that joint's spline. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__gr__grmutecity-024
This bounded subjects shard contains six parameter identities, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic facts or register-to-source parameter mappings are proposed.

### shard-main__melee__gr__grmutecity-025
The six assigned parameter subjects belong to small additive wrappers. Each function adds its sole floating-point argument to `grMc_8049F4B8[index].x10`, with indices 1 through 6 respectively. The bodies perform no validation, clamping, or other operations. All six subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition.

### shard-main__melee__gr__grmutecity-026
The six assigned parameter subjects belong to functions that each accept an f32 argument and add it directly to x10 of grMc_8049F4B8 at indices 7 through 12, respectively. These functions also appear in the corresponding sequence in grMc_803E3C6C. All six subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition. Review is limited to this bounded shard.

### shard-main__melee__gr__grmutecity-027
The six assigned parameter subjects have no baseline facts. Their canonical function bodies each accept one `f32 arg0` and add it to `grMc_8049F4B8[index].x10`, for indices 13 through 18 respectively. These functions also appear consecutively in `grMc_803E3C6C`. This review establishes only source-level accumulation behavior, not gameplay meaning or a compiled-register parameter mapping.

### shard-main__melee__gr__grmutecity-028
The six assigned parameter subjects belong to functions grMuteCity_801F1904 through grMuteCity_801F197C. Each canonical body accepts one `f32 arg0` and adds it to `grMc_8049F4B8[index].x10`, with indices 19 through 24 respectively. These functions also appear in the corresponding ordered callback table. All six subjects have empty baseline fact lists; there are no baseline facts to disposition. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gr__grmutecity-029
The first five assigned parameter subjects correspond to functions whose sole source argument is `f32 arg0`, added directly to `grMc_8049F4B8[25..29].x10`, respectively. These functions also appear consecutively in `grMc_803E3C6C`. The sixth function, `grMuteCity_801F1A0C`, declares an `HSD_GObj* gobj` first argument but does not use it; its body only calls `Ground_801C53EC(0x5CC60)`. All six assigned subjects have empty baseline fact lists, so there are no baseline facts to disposition. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__gr__grmutecity-030
The six assigned parameter subjects contain no baseline facts. Current source shows that grMuteCity_801F1A0C ignores its Ground* parameter. grMuteCity_801F1A34 obtains mutable object state and a joint hierarchy from its first argument, and spline and track-reference state from its second; it updates 30 joint-backed records and conditionally manages associated objects and generators. grMuteCity_801F290C uses its Ground_GObj argument to save, override, and restore up to four light colors. grMuteCity_801F2AB0 forwards its integer argument, its quotient by 1000, and its joint argument to grLib_801C9808, then configures the resulting generator's application transform. No baseline dispositions or new facts are proposed.

### shard-main__melee__gr__grmutecity-031
The four assigned parameter subjects have no baseline facts to assess. In the current source, grMuteCity_801F2BBC uses its enum argument to select one of two DynamicsDesc pointers when grMc_804D69D4 equals 1, otherwise returning NULL. grMuteCity_801F2C10 reads a position and compares its joint argument against five stored joints; for matching joints it checks horizontal bounds and a vertically offset interpolated line. Missing map data or an unmatched joint returns true. Its integer argument is unused.

### shard-main__melee__gr__grmutecity-032
Reviewed the twelve assigned links against current canonical source. The linked functions participate in Mute City initialization and command dispatch, stage-object callback setup, animation, collision-line updates, racer interaction accumulation, light-color replacement/restoration, and particle AppSRT scaling. Source-level racer state usage is established, but its attribution to the compiled .bss target remains unverified. This is bounded link review, not complete TU coverage.

### shard-main__melee__gr__grmutecity-033
The reviewed links cover Mute City's stage registration, ground-object callbacks, camera-relative blast-zone storage, spline-derived collision geometry, and stage-owned car records with item proxies and threshold-triggered visual changes. The particle helper configures attached generators, but its current body does not explicitly return the value consumed by callers. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gr__grmutecity-034
The reviewed links connect Mute City's stage callbacks, warning-interface initialization, and racing-machine subsystem. The racer update advances 30 records along paired track splines, positions and orients models, creates nearby interaction objects, and handles accumulated-damage effects and model replacement. Indexed callbacks add to the same per-racer accumulator consumed by those transitions. This assessment covers only the assigned links, not the entire translation unit.

### shard-main__melee__gr__grmutecity-035
The reviewed links cover Mute City's indexed Ground callback setup, initialization of camera-relative bounds, a recurring rotation update, an empty process callback, spline-driven collision-line updates, and per-car scalar accumulation feeding model/effect transitions. Source establishes the stage descriptor and callback wiring; compiled section membership and the full item-damage interpretation remain deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__gr__grmutecity-036
Reviewed the twelve assigned links. Current source connects per-car accumulators to threshold-driven effects, model replacement and removal of interactive objects; derives runtime collision-line endpoints from spline crossings; and registers initialization and collision callbacks with Mute City's stage implementation. The model-descriptor getter feeds interface initialization, but its specific warning-indicator meaning remains unverified.

### shard-main__melee__gr__grmutecity-037
Reviewed the 12 assigned links, not the entire translation unit. Current source identifies the Mute City stage, installs per-Ground callbacks, accumulates per-car damage used for effect/model transitions, attaches Ground-associated item proxies to car joints, and configures generator AppSRT scaling. Collision-refresh semantics and the compiled storage alias underlying one movement routine remain deferred.

### shard-main__melee__gr__grmutecity-038
Reviewed the twelve assigned links. The current source connects indexed accumulator callbacks to temporary item proxies on moving stage models; accumulator thresholds trigger effects, model replacement, and proxy removal. It also supplies a shared always-false stage predicate and a position-dependent eligibility predicate. Compiled .rodata identity and some cross-module callback semantics remain deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__gr__grmutecity-039
The reviewed Mute City callbacks initialize 30 car records, advance and place their models along splines, and maintain proximity-gated joint-backed item objects. Indexed callbacks accumulate per-car values consumed by threshold-driven effect, model-replacement, and disabling logic. A separate component initializes animation and retained-joint state and subsequently adjusts joint rotation. This review covers only the assigned links.

### shard-main__melee__gr__grmutecity-040
The reviewed links cover Mute City's indexed racing-machine accumulators and Ground-owned item proxies, spline-driven collision placement, a constant-false stage callback, shadow eligibility, and a startup model-descriptor provider. The machine update consumes accumulated values to trigger effects, replace a model child, and remove its proxy. This is bounded link coverage, not complete TU coverage.

### shard-main__melee__gr__grmutecity-041
The reviewed links cover Mute City's lifecycle generator call, an empty registered ground-object process, initialization of spline/controller/bounds/light state, and an index-5 accumulator passed through the stage's temporary item creation path. This is bounded link review, not complete TU coverage.

Status: researched; no-change lead bypass; independent review and live promotion pending.
