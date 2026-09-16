# Disjoint Librarian Research

### shard-main__melee__it__kinds__itlikelike-000
Reviewed canonical and rendered `src/melee/it/kinds/itlikelike.c` lines 1–480 only. This range defines a 22-entry callback table, initialization, damage-response branching, timed state selection, proximity tests, and movement/collision handling. Initialization clears local state, saves position, selects a random binary mode and delay, lowers Y by 40, and dispatches by mode. The proximity helper clears its direction result, checks a returned object against eligibility and rectangular distance thresholds, and stores the object plus a left/right result only on success. State 0 counts down before selecting one of two movement initializers; state 7 periodically invokes that proximity helper. State 1 combines timed random transitions, proximity checks, reversal when horizontal nudge opposes facing, and collision-driven reversal. A low-displacement counter also reverses movement after repeated qualifying checks. The assigned range ends partway through state 2's physics callback.

### shard-main__melee__it__kinds__itlikelike-001
Reviewed canonical and rendered lines 481–960 of `src/melee/it/kinds/itlikelike.c`, not the complete TU.

- Movement/collision code copies collision-resolved positions, records ceiling indices, reverses horizontal movement on helper-reported conditions, and reverses after repeated small displacements. It maintains a previous-position snapshot and a stagnation counter.
- Transition routines swap ECB top/bottom, clear orientation/counter fields, and select numeric motion states. State 3 initialization rotates the model by π; its physics adds the fall-speed attribute to vertical velocity. State 16 branches on `x38`, initializes horizontal velocity and counters, and selects state 1 or 2.
- State 8 starts with twice the attribute-derived horizontal speed and a 30-tick counter. Its physics clears the stored object on timeout, handles a missing object separately, and selects one of two routines when the horizontal difference from a helper-produced vector is below 15.
- Capture-related plumbing copies `grab_victim` into `x50`. Entry routines clear that pointer and pass this callback together with `ftCo_800C78B0` to `it_80274F28`; state 12 subsequently branches on whether `x50` was populated. Its physics and collision paths explicitly distinguish `GA_Air` from the other case.

### shard-main__melee__it__kinds__itlikelike-002
Reviewed canonical and rendered lines 961–1394, with lines 940–968 read for boundary context; this is not complete TU coverage.

- Motion 9/10 animation callbacks branch on the stored victim pointer after `it_80272C6C` returns zero. Motion 13 repeats its state and uses `x4C` as a countdown, periodically calling `ftCo_800C7C60` on `grab_victim` with attribute `x3E` and reloading from `x3D`.
- `it_802DBAF0` conditionally hands a matching tracked grab victim to `ftCo_800C7B0C`, supplying item-relative collision-center and joint-derived positions, a selector-dependent scalar, and one of two attribute addresses. It then clears three victim references. Motions 14/15 invoke this helper at attribute `x38`, with opposite scalar selectors, and return through `it_802D9DDC` at counter 40 after storing 120.
- Pickup, repeated motion 18, and destruction call the same victim-cleanup helper. Drop initialization conditionally swaps ECB top/bottom and clears `x38`; throw initialization enters motion 19, whose physics delegates using fall-speed attributes.
- Motion 6 counts down, then either calls `it_802DA104` or performs victim cleanup, conditional ECB swapping, flag clearing, and a transition to motion 5. Its collision callback has a separate `x38 == 1` path that copies collision position and, on success, the ceiling index.
- Motion 20 repeats its animation state. Motion 21 directly subtracts fall speed from vertical velocity. The final creation wrapper passes `It_Kind_Likelike` to `it_8027B5B0`, stores its first argument in `x38`, and chooses initialization according to whether that argument is zero; its third argument is unused.

### shard-main__melee__it__kinds__itlikelike-003
The assigned header declares the Like Like module interface, not executable behavior. It exposes predominantly single-`Item_GObj*` functions, including numbered motion declarations with boolean Anim/Coll signatures and void Phys signatures, plus named item-logic declarations. Exceptions include `it_802DAD18(HSD_GObj*)`, `it_802DBAF0(Item_GObj*, s32, s32)`, and `it_802DC4BC(s32, Vec3*, s32)` returning `Item_GObj*`. It also declares the externally defined, unsized `ItemStateTable it_803F8468[]`. Coverage is limited to header lines 1–100, read in both canonical and rendered form; no implementation or complete TU coverage is claimed.

### shard-main__melee__it__kinds__itlikelike-004
The reviewed declarations provide a 22-entry motion callback table and a constant zero vector. Pickup invokes guarded victim handling before requesting motion state 18 with animation updating; destruction invokes the same helper before shared destruction handling. The helper computes positions, selects attribute parameters, calls the fighter subsystem, and clears victim references only when its state and victim-identity guards pass. Source declarations alone do not establish compiled section placement. This review covers only the assigned subjects.

### shard-main__melee__it__kinds__itlikelike-005
Reviewed the six assigned callback subjects, not the complete translation unit. Motion 0 conditionally reselects its animation, counts down x4C before selecting a horizontal-velocity initialization path, and separates ceiling-index synchronization from floor-support handling. Motion 10 dispatches through x50 after its predicate becomes false and delegates floor-support loss to the state-5 initializer. The thrown callback clears x4C and selects state 19. Several gameplay interpretations and shared-helper descriptions remain unverified.

### shard-main__melee__it__kinds__itlikelike-006-repair3
Reviewed the six assigned callback subjects, their table registrations, and relevant local and shared helpers. Motion 10 physics is empty. The shared motion-12 callbacks select an exit using the stored grab-victim pointer, apply air or surface-relative physics, and handle landing or loss of support. Motion 13 repeats its animation and delegates terrain handling while adjacent physics periodically processes the grabbed fighter. Two baseline descriptions need qualification: the animation-exit helper performs a collision query rather than demonstrated cleanup, and tangent-velocity reconstruction does not unconditionally preserve magnitude.

### shard-main__melee__it__kinds__itlikelike-007
Reviewed the six assigned subjects, not the entire translation unit. State 13's physics callback periodically damages the grabbed fighter. States 14 and 15 use the same counter-driven release timing, differing in the release-helper parameter; the helper validates the recorded victim before applying a fighter response and clearing references. Their collision callbacks share floor maintenance and a state-5 transition on lost support. State 14's physics callback is empty.

### shard-main__melee__it__kinds__itlikelike-008
Reviewed the six assigned subjects. States 15 and 16 have empty physics callbacks. State 16's animation callback conditionally initializes horizontal movement and selects state 1 or 2 using x38; its collision callback selects delegated floor processing or explicit ceiling bookkeeping. State 17's animation callback conditionally invokes collision processing and the state-0 setup helper; its collision callback synchronizes position and floor bookkeeping before returning a shared predicate. Gameplay-specific landing and stage mappings remain deferred where the inspected call chain is insufficient.

### shard-main__melee__it__kinds__itlikelike-009
Reviewed the six assigned callbacks, their state-table registrations, local lifecycle entry points, and relevant shared helpers. State 17 redirects velocity using the floor normal and facing, then requests floor-orientation interpolation. Pickup enters state 18, whose animation callback repeats setup and state selection when the model hierarchy reports no active animation; its physics callback is empty and its collision slot is null. Throwing enters state 19, whose animation callback returns false, physics forwards fall attributes to the shared vertical-velocity updater, and collision forwards the shared collision result.

### shard-main__melee__it__kinds__itlikelike-010
Reviewed the six assigned callbacks and their baseline facts, not the complete translation unit. State 1 initializes horizontal movement, uses two countdowns to select states 7, 8, or 16, reverses movement against an opposing nudge, and passes velocity and floor normal to shared movement processing. Its collision callback conditionally reverses direction, tracks low displacement in both axes, saves position, and returns a shared check. States 1 and 20 conditionally reapply their respective states when it_80272C6C returns false. State 20 has empty local physics and directly delegates collision processing to it_8027C79C.

### shard-main__melee__it__kinds__itlikelike-011
Reviewed the six assigned callbacks for states 2 and 21. State 21 has inert animation and collision callbacks and subtracts the fall-speed attribute from vertical velocity. State 2 conditionally reselects its animation, performs timer-gated proximity decisions and facing-directed movement, and resolves map position with contact and low-displacement reversals. Gameplay labels, exact movement orientation, and several helper-dependent interpretations remain deferred; this is not complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-012
Reviewed the six assigned callbacks and their relevant state-table entries and collision helpers. State 3 has a no-op animation callback, an unconditional vertical-velocity addition, and collision delegation to it_8026E71C. States 4 and 5 share a no-op animation callback; their collision callbacks use it_8026E414 with different events, selecting state 0 and state 17 respectively. All three collision callbacks return the constant-false result of it_8027C794. This review does not establish stage-specific gameplay mappings or complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-013
Reviewed the six assigned callback subjects, not the complete translation unit. The shared state-4/5 physics callback checks for a target only in state 5 and otherwise forwards falling parameters. State 6 has an inert animation callback, a countdown with zero tested before decrement, and mode-dependent collision handling. State 7 conditionally invokes the state-1 initializer from animation processing. Its collision callback and state 6's collision callback share the same ceiling-index/position update branch and generic fallback.

### shard-main__melee__it__kinds__itlikelike-014
Reviewed the six assigned callbacks and supporting canonical code, not the complete translation unit. State 7 periodically attempts target acquisition and initializes state 8 with target-facing velocity and a countdown of 30. State 8 reselects its animation, approaches a retained target, and exits on timeout, missing target, or close horizontal proximity. Its collision callback selects ceiling-aware or floor collision handling. State 9's animation callback conditionally queries floor collision and selects a subsequent state according to x50; its collision callback updates floor contact and invokes the state-5 reset on loss of support. The shared collision return helper is constant false, not a collision-status test.

### shard-main__melee__it__kinds__itlikelike-015-repair2
Reviewed the six assigned subjects. They implement an empty physics callback, damage-response branching, drop-time collision restoration and state selection, proximity-based target selection, facing reversal with horizontal-speed reset, and randomized initialization into states 4 or 3. Gameplay-specific interpretations and original-name claims are deferred where the inspected source does not establish them.

### shard-main__melee__it__kinds__itlikelike-016
Reviewed the six assigned state-entry helpers and relevant local callers. They reset into state 0, initialize facing-dependent horizontal movement for states 1 and 2, exchange vertical ECB extents for the inverted state-0 entry, and restore the non-inverted configuration for states 4 and 5. State 0 dispatches after its countdown; state 5 conditionally acquires a fighter before otherwise applying falling physics. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-017
Reviewed the six assigned entry/setup functions and their relevant callers and continuations. They initialize floor-contact state 17, rotated state 3, reorientation state 16, target-directed state 8, and direction-selected capture states 11/12, or retain a successful grab victim. Capture continuations hold and periodically damage the fighter before release. Several baseline descriptions overstate falling direction, floor-only movement, stage provenance, or the meaning of the shared xD09 flag.

### shard-main__melee__it__kinds__itlikelike-018
Reviewed the six assigned helpers and their capture, holding, and release paths. The two capture-entry helpers select motions 9 and 10, install paired callbacks, and clear the tracked victim. Successful capture records the victim and initializes the fighter's hidden CaptureLikelike state. Motion 13 periodically damages the held fighter. Timer completion selects motion 14 or 15; those callbacks invoke parameterized victim release. The captured fighter's damage callback instead requests immediate alternate release. Release validates the victim relationship, supplies placement and response parameters to fighter code, and clears three item-side victim references. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-019
Reviewed the assigned baseline subjects against canonical source. The entry routines initialize a countdown-based damage response, two randomized high-damage response states, and a nullable constructor with selector-dependent initialization. The table contains 22 states; sampled supporting bodies establish target-directed movement, retained victim handling, release cleanup, and pickup/drop/throw transitions. This is bounded subject review, not complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-020
The six assigned parameter subjects have no baseline facts. Their current function bodies all declare a single `Item_GObj* gobj` parameter. PickedUp forwards it to a helper and a state-change call; Thrown additionally clears the item's x4C field. Motion0 callbacks use the object for animation checks, a countdown-driven transition, and collision processing. Motion10_Anim branches on the associated item's x50 field after an animation check. These observations do not establish compiled register identities.

### shard-main__melee__it__kinds__itlikelike-021
The six assigned parameter subjects correspond to canonical `Item_GObj* gobj` callback arguments. Motion10_Phys does not use its argument; Motion10_Coll forwards it to two helpers. Motion12_Anim obtains item data and branches to different helpers when its animation predicate returns zero, depending on whether x50 is non-null. Motion12_Phys and Motion12_Coll select processing based on ground_or_air. Motion13_Anim passes the object to an animation predicate and reselects state 13 when that predicate is false. All six subjects have empty baseline fact arrays; there are no baseline facts to disposition. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-022-repair2
Reviewed the six assigned callback parameters; none has baseline facts. The canonical functions take `Item_GObj* gobj`. Motion13 physics accesses the item's counter and attributes, periodically passing its grab victim to a fighter helper. Motion13 and Motion14 collision callbacks forward the object to two helpers. Motion14 physics does not use the parameter. Motion14 and Motion15 animation callbacks access the item's counter and invoke the same helper with opposite signed arguments.

### shard-main__melee__it__kinds__itlikelike-023
The six assigned parameter subjects have no baseline facts. Their canonical functions take `Item_GObj* gobj`: motion-15 and motion-16 physics callbacks are empty; motion-15 collision forwards the object to two helpers; motion-16 animation initializes velocity and counters and selects state 1 or 2 when a helper returns zero; motion-16 collision branches on item-local x38 and can copy collision position and ceiling index into the item; motion-17 animation conditionally calls two helpers and always returns false. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-024
The six assigned parameter subjects correspond to canonical `Item_GObj* gobj` parameters. Motion17 physics obtains item data and passes velocity, floor normal, and facing direction to a helper, then forwards the object to another helper; its collision callback forwards the object through two helpers. Motion18 animation conditionally calls two helpers with the object and always returns false; its physics callback is empty. Motion19 animation ignores the object and returns false; its collision callback forwards it to `it_8027C824` with a NULL second argument. All six subjects have empty baseline fact lists, so there are no fact dispositions.

### shard-main__melee__it__kinds__itlikelike-025
The six assigned parameter subjects have no baseline facts. Their current function definitions each take `Item_GObj* gobj`. Motion 1's callbacks conditionally reissue a state-change call, update counters and velocity, and process collision-dependent direction changes while saving position. Motion 19's physics callback passes the object and its item fall-speed attributes to `it_80272860`. Motion 20's animation callback conditionally reissues its state-change call and returns false; its collision callback forwards the object to `it_8027C79C` and returns that result. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-026
Reviewed the six assigned parameter subjects against their current callback bodies. Each callback declares an `Item_GObj* gobj` parameter. Motion20_Phys and Motion21_Anim do not use it; Motion21_Anim returns false. Motion21_Phys accesses the object's item data and subtracts the configured fall-speed value from vertical velocity. Motion21_Coll forwards the object to it_8027C794. Motion2_Anim conditionally reapplies motion 2 with animation-update and hit-preservation flags, then returns false. Motion2_Coll updates collision-derived position, conditionally reverses horizontal motion, tracks repeated small displacements, stores the current position, and returns it_8027C794's result. All six subjects have empty baseline fact arrays, so there are no fact IDs to disposition.

### shard-main__melee__it__kinds__itlikelike-027
Reviewed the six assigned parameter subjects; all have empty baseline fact lists. Their current functions declare an Item_GObj* parameter named gobj. Motion2_Phys accesses item state through that object, updates a countdown and horizontal velocity, and conditionally invokes transition helpers. Motion3_Phys adds the item's fall-speed attribute to vertical velocity. Motion3_Coll and Motion4_Coll forward the object to collision helpers and return it_8027C794(gobj). Motion3_Anim and Motion5_Anim ignore the parameter and return false. This is a bounded subject review, not complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-028
The six assigned parameter subjects have no baseline facts. Their current functions each declare an `Item_GObj* gobj` parameter. Motion5 physics reads item attributes and conditionally transitions through it_802DB398; otherwise it forwards fall-speed attributes to it_80272860. Motion5 collision forwards the object to collision helpers. Motion6 animation ignores its parameter and returns false; its physics decrements a counter or transitions when zero, while collision selects a path using x38. Motion7 animation forwards the object to it_80272C6C and conditionally it_802DA104, then returns false. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-029
The six assigned parameter subjects have no baseline facts. Their current function definitions all take `Item_GObj* gobj`. Motion7 physics decrements a timer or invokes a detection helper and conditionally transitions. Motion7 and Motion8 collision callbacks select collision handling using the item's x38 field, update position and ceiling index in one branch, and return a common helper result. Motion8 animation conditionally reselects state 8; its physics updates a countdown and branches on a stored object and horizontal distance. Motion9 animation conditionally dispatches to one of two helpers according to whether the stored object is non-null. This review is limited to the assigned subjects.

### shard-main__melee__it__kinds__itlikelike-030
The six assigned parameter subjects have no baseline facts to disposition. Their current function definitions use `Item_GObj* gobj`: motion-9 physics is empty; motion-9 collision forwards the object to two helpers; damage handling updates item state and selects a transition; dropped handling resets orientation-related state and enters state 4; `it_802D9A2C` performs position-threshold checks and records a candidate and horizontal direction; `it_802D9B78` reverses facing and recomputes horizontal velocity. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-031
The six assigned parameter subjects have no baseline facts to disposition. Their canonical function bodies take `Item_GObj* gobj`, used as the object passed to item helpers and, in five bodies, to obtain mutable item data. The reviewed routines initialize item fields, enter states 0/1/2/4, initialize horizontal velocity and counters, or exchange the collision box's top and bottom values. These observations do not establish compiled register-to-parameter identity or gameplay names.

### shard-main__melee__it__kinds__itlikelike-032
The six assigned parameter subjects belong to object-based state-entry and callback functions. Their canonical bodies use the object to reset item-local fields and enter states 5 or 17, rotate its joint and enter state 3, enter state 16, initialize horizontal velocity and a counter before entering state 8, or copy grab_victim into a stored reference and clear a flag. All six subjects have empty baseline fact arrays; there are no baseline facts to disposition. This review does not establish register-level parameter identity or complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-033
The six assigned parameter subjects have no baseline facts. Their canonical functions each accept `Item_GObj* gobj` and obtain the associated Item. `it_802DB398`, `it_802DB5F0`, and `it_802DB74C` configure transitions and register the same callback pair while clearing `likelike.x50`. `it_802DB8A8` clears `likelike.x4C` and selects state 13; `it_802DB9F4` clears that field and randomly selects state 14 or 15. `it_802DBA68` invokes `it_802DBAF0(gobj, 0, 1)`, sets the field to 120, and calls `it_802D9DDC`. These are source-level observations, not gameplay names or verified register-layout mappings.

### shard-main__melee__it__kinds__itlikelike-034
The six assigned parameter subjects have no baseline facts. In the current source, it_802DBAF0 accepts an item object and two integer selectors: the first selects zero or one of two attribute floats; the second selects an attribute block passed to ftCo_800C7B0C. Processing requires a matching non-null grab victim and excludes motion state 8; afterward it clears three victim references. The other three functions accept item objects and initialize motion states 6, 20, and 21, respectively. This is a bounded parameter review, not complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-035
The assigned three parameter subjects have no baseline facts. In the current source, it_802DC4BC takes (s32 arg0, Vec3* arg1, s32 arg2). It forwards arg1 to it_8027B5B0; if the returned object is non-null, it stores arg0 in likelike.x38 and selects initialization according to whether arg0 is zero. arg2 is unused in this body. The function returns the resulting object pointer.

### shard-main__melee__it__kinds__itlikelike-036
The reviewed links cover Like Like callback registration, facing and movement initialization, bounded target tracking, capture setup, periodic grabbed-fighter processing, and victim cleanup. Two callbacks are no-ops; the motion-1 animation callback re-enters the same state rather than selecting a different state. The reviewed code supports capture behavior but does not independently establish the narrower gameplay label 'swallow attack'. This review covers only the assigned links.

### shard-main__melee__it__kinds__itlikelike-037
The reviewed code registers item motion callbacks, initializes per-instance state, adjusts vertical velocity, selects nearby fighter targets, and transitions from target-directed movement into grab handling. Motion10's physics callback is empty. Damage handling can enter motion21, whose physics subtracts the configured fall-speed value. This review covers the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-038
The reviewed links cover Like Like item-state callbacks, capture setup and retained-victim processing, release-state callbacks, and pickup/thrown-state behavior. Canonical code confirms callback registration, grab-victim tracking, periodic fighter callback invocation, passive pickup-state physics, and fall-parameter application after throwing. This review does not establish full translation-unit coverage or Adventure Mode placement.

### shard-main__melee__it__kinds__itlikelike-039
Reviewed the twelve assigned links against current source. The reviewed code registers Like Like state callbacks, reverses facing and horizontal velocity, handles collision responses, periodically processes a grabbed fighter, and provides empty physics callbacks. Specific swallow/spit gameplay mappings remain deferred where the inspected code establishes only targeting or victim-processing mechanics.

### shard-main__melee__it__kinds__itlikelike-040
The reviewed callbacks belong to an item state machine with timed movement dispatch, target-dependent approach, recorded grab-victim handling, thrown-state fall parameters, and orientation-dependent collision processing. This review covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itlikelike-041
The reviewed routines implement Like Like item-state initialization, orientation-dependent movement and collision reversal, animation-driven recovery, and fighter-capture setup and cleanup. The capture callback enters the fighter's CaptureLikelike state. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itlikelike-042
Reviewed the 12 assigned links against current canonical callback bodies and their local registrations or callers. The reviewed code connects the Like Like item state table to movement transitions, collision dispatch, victim retention and cleanup, and item lifecycle behavior. Two reviewed animation callbacks simply return false, and the reviewed physics callbacks for motions 9 and 16 are empty. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__it__kinds__itlikelike-043
The reviewed links connect the Like Like item state machine to its registered animation and collision callbacks, pickup/drop transitions, configured falling physics, and retained-grab-victim processing. Capture callbacks save the grab victim; subsequent animation completion enters a looping state with periodic fighter processing. This review covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itlikelike-044
The reviewed links cover Like Like initialization, state callbacks, terrain contact, downward acceleration, damage response, and timed release of a tracked fighter. Current code confirms the fighter capture damage callback calls back into the item to release its victim and restore state 0. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-045
The reviewed ranges define item-state callbacks, proximity-based fighter targeting, terrain-response dispatch, pickup-state entry, damage-response branching, and construction of an It_Kind_Likelike object. Motion 2's animation callback reinstalls state 2 rather than selecting a different state. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-046
The reviewed callbacks implement Like Like animation looping, proximity-sensitive movement, orientation-dependent collision, capture registration, periodic damage to a retained fighter, timed release, and thrown-state initialization. Fighter-side code confirms CaptureLikelike entry and release initiation when the grab timer expires. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itlikelike-047
The reviewed links cover Like Like state callbacks, airborne fighter acquisition, capture and timed release, pickup, throwing, and destruction. The acquisition path installs a fighter-capture callback; captured fighters become invisible and later trigger release motions that apply damage and knockback. Pickup and destruction also release a matching captured fighter. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__it__kinds__itlikelike-048
Reviewed the twelve assigned links against current canonical callbacks and relevant state transitions. These cover Like Like movement and collision, orientation-dependent recovery, dropped-state initialization, and fighter capture setup and interruption. Retained relationships use narrower source-level explanations where historical gameplay wording exceeds the inspected evidence; this is not complete TU coverage.

### shard-main__melee__it__kinds__itlikelike-049
The reviewed source defines the Like Like item callback table and dedicated state handling. Its motion-7 collision callback selects between two collision paths using `likelike.x38`; one copies collision-resolved position and conditionally records the ceiling index, while the other supplies a state-transition callback to a shared collision helper. Both paths return the same shared helper's result. This review covers only the two assigned implementation links.

Status: researched; no-change lead bypass; independent review and live promotion pending.
