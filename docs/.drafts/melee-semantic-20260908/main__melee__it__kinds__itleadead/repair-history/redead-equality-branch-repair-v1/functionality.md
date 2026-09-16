# Disjoint Librarian Research

### shard-main__melee__it__kinds__itleadead-000
Reviewed canonical and rendered `itleadead.c` lines 1–480 only. This range defines an 18-entry item callback table, initialization, threshold-based reaction dispatch, and callbacks for timed waiting, facing-directed horizontal movement, and motion states 10–12. Initialization sets collision facing, clears local counters and a fighter pointer, saves attribute-derived values, and invokes the state-10 entry helper. The reaction dispatcher resets timers, accumulates a helper-produced value in `xC9C`, and selects transitions using thresholds, current state, helper results, and randomness; one branch requests a small camera quake. State 2 initializes horizontal velocity from facing and an attribute, maintains counters, and selects other callbacks based on predicates, opposing nudge, and collision results. State 10 clears a timer and scales horizontal velocity. States 11 and 12 share physics/collision callbacks but use different timer-expiry destinations; their shared physics subtracts fall speed while airborne.

### shard-main__melee__it__kinds__itleadead-001
Reviewed canonical and rendered lines 481–960 of `itleadead.c`, with a small continuation read to finish `it_802EA6F4`; this is not complete TU coverage.

- Motion 7 advances through counter-selected ECB adjustments and enters motion 8. Motion 8 waits on a countdown initialized from `xC9C * attr->x1A`, then enters motion 9. Motion 9 performs another timed ECB sequence and invokes an earlier inline transition when `it_80272C6C` returns zero.
- Motion 3 reverses facing when its countdown reaches zero and synchronizes collision facing. Motion 4 enables facing-scaled horizontal velocity after counter 36 and overrides it to zero after 113; its collision callback can transition to motion 3 or initialize motion 2.
- Motion 5 restarts itself while preserving hit state and restores a joint's Z translation. Motion 6 reloads `x4C` from an attribute before invoking an earlier transition. Pickup and throw callbacks select motions 13 and 14, whose animation callbacks restart those motions. Drop delegates to shared and inline helpers.
- Motions 16 and 17 directly subtract fall speed from vertical velocity. Destruction conditionally invokes two helpers for a stored fighter reference before shared cleanup.
- `it_802EA478` selects saved or current ECB values, adjusts their bounds by two selectors, submits the result, and synchronizes collision facing. `it_802EA674` compares facing with a horizontal side derived from a queried fighter position. `it_802EA6F4` combines a countdown, random gate, fighter predicate, horizontal attribute bound, and absolute vertical distance limit of 5.

### shard-main__melee__it__kinds__itleadead-002
Reviewed canonical and rendered lines 961–1146 only. This region implements a facing-relative floor-query comparison, an existing-wall-flags fallback, item creation/setup, fighter-reference setup and cleanup, and two post-cleanup branches. `it_802EA804` rejects successful queries when vector-angle differences exceed 30 degrees or negative-dot differences exceed 3; failed queries fall back to `it_802EA988`. That fallback returns 8 for left-wall flags, 4 for right-wall flags (right wins when both are present), or zero; its local position offsets do not affect the result. `it_802EA9FC` creates an `It_Kind_Leadead` item and initializes facing and animation-related state on success. `it_802EAAEC` resets velocity, selects state argument 5, applies a -12 joint Z translation, updates facing, and stores a fighter and part reference. `it_802EAC8C` computes a replacement position using those references and an opposite Z offset, clears the references, resets joint Z, and reloads/clears two item variables. Both final entry points call this cleanup, then branch on ground/air; their grounded paths differ, with `it_802EAE80` resetting velocity and selecting state argument 6.

### shard-main__melee__it__kinds__itleadead-003
The assigned header declares the Leadead item interface, not executable behavior. It exposes Item_GObj-based functions, including numbered Anim/Phys/Coll declaration families and lifecycle-named callbacks. Anim and Coll declarations return bool; Phys declarations return void. Additional signatures accept integer and floating-point arguments, a Vec3 pointer, or a Fighter_GObj pointer; it_802EA9FC returns Item_GObj*. The header also exports the unsized ItemStateTable array it_803F8EB0. Review covers only itleadead.h lines 1–90, in canonical and rendered views.

### shard-main__melee__it__kinds__itleadead-004
The reviewed subjects cover an 18-entry Leadead callback table and pickup, drop, and destruction wrappers. Pickup requests state 13; its animation callback requests the same state again when its completion test succeeds. Drop performs shared setup, clears x48, scales horizontal velocity by attribute xC, and requests state 10. Destruction conditionally clears a recorded fighter attachment and invokes fighter release before forwarding to shared destruction handling. Source literals do not establish compiled .sdata2 ownership.

### shard-main__melee__it__kinds__itleadead-005
The reviewed callbacks initialize state 14 after throwing, supply state 10's inert animation hook and attribute-driven physics/collision delegation, and implement grounded, counter-gated exits from states 11 and 12. Positive counters decrement; zero permits the grounded transition; negative counters remain unchanged. State 11 exits to state 1, while state 12 calls the state-8 initializer. This review covers only the six assigned subjects and their necessary supporting source.

### shard-main__melee__it__kinds__itleadead-006
The reviewed callbacks supply airborne vertical acceleration and ground/air collision dispatch for states 11–12, an inert physics phase and conditional same-state animation update for state 13, and conditional animation renewal plus delegated environment-contact handling for state 14. Local lifecycle bodies select state 13 on pickup and state 14 on throw. The shared contact routine conditionally attempts an item spawn and notifies the generator; describing that spawn routine as collision cleanup is inaccurate. This review covers only the six assigned subjects.

### shard-main__melee__it__kinds__itleadead-007
Reviewed the six assigned callbacks, their state-table registrations, nearby entry routines, and shared collision helpers. State 14 physics forwards two item fall attributes to a shared helper. State 15 has inert animation and physics callbacks and delegates collision handling to a conditional, mutating helper. State 16 animation is inert; its collision wrapper delegates to an unconditional-false helper. Specific visible gameplay mappings remain deferred.

### shard-main__melee__it__kinds__itleadead-008
Reviewed the six assigned callback subjects, not the entire translation unit. States 16 and 17 subtract configured fall acceleration from vertical velocity. State 17's animation callback is inert and its collision callback forwards shared collision status. State 1's animation callback is inert; companion physics performs countdown-driven progression, while collision delegates support handling and supplies the state-10 transition.

### shard-main__melee__it__kinds__itleadead-009
Reviewed the six assigned callbacks and relevant local transitions. State 1 decrements a nonzero counter and enters state 2 at zero. State 2 restores facing-directed velocity on its animation predicate, makes timer- and fighter-dependent transition decisions, and routes edge/wall contact to state 3 and lost support to state 10. State 3 reverses facing when its counter is observed at zero and returns to state 2 when its animation predicate clears. Its collision callback delegates support handling and returns false. Visible limping/charging labels remain hypotheses; this is not complete TU coverage.

### shard-main__melee__it__kinds__itleadead-010
Reviewed the six assigned callbacks and their local state-entry context. Motion-3 physics is empty. Motion-4 animation returns false; its physics increments x48 and assigns horizontal speed for counter values 37–113, then zero above 113. Its collision callback conditionally selects state 3 or 2 and passes velocity and floor-normal data to shared helpers. Motion-5 animation conditionally reapplies state 5 and joint-1 Z translation; its collision callback always returns false. Visible gameplay identities and unverified shared-helper semantics remain deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itleadead-011
Reviewed the six assigned callbacks and their relevant helpers. States 5 and 6 have empty physics callbacks. State 6's animation callback reloads x4C, clears x48, and selects state 1 when its animation predicate returns zero. State 7 advances collision-bound adjustments using x44, then initializes state 8's timed wait. States 6 and 7 delegate floor handling to different helpers, both supplying the state-10 transition callback and returning false. The state-6 helper additionally performs support-loss cleanup and a conditional supported-path call. Visible gameplay labels remain less certain than these source-level behaviors.

### shard-main__melee__it__kinds__itleadead-012
Reviewed the six assigned callbacks, not the complete translation unit. State 7 physics delegates floor-relative velocity and orientation updates. State 8 has an inert animation callback and a physics countdown that enters state 9 only when the counter is already zero; surface updates still execute on that transition frame. States 8 and 9 share ground-support processing and the support-loss transition to state 10. State 9 animation dispatches six counter-dependent command pairs and conditionally writes a ten-tick counter before entering state 1. Visible downed/revival labels remain unverified.

### shard-main__melee__it__kinds__itleadead-013
Reviewed the six assigned subjects. They cover an empty state-9 physics callback, actor initialization, threshold-driven reaction dispatch, and entry into states 1, 2, and 10. State 1 counts down before state 2 initializes facing-directed velocity; state 10 clears that countdown and scales horizontal velocity. A concrete baseline error was found: the ordinary reaction branches call it_802E93C8, which selects state 11, not state 10. Visible gameplay mappings and exact recovered names remain qualified where current canonical code does not establish them.

### shard-main__melee__it__kinds__itleadead-014
Reviewed six state-entry helpers and their local callers and consumers. States 11 and 12 initialize velocity, facing, and attribute-derived delays; their animation callbacks require zero delay and ground contact to exit. State 7 initializes a staged counter sequence leading to state 8; state 8 initializes a damage-scaled countdown leading to state 9. State 9 resets counters before a staged sequence returning to state 1. State 3 stops movement, initializes a 140-update counter, and reverses facing when zero is observed. Visible collapse/revival mappings remain unverified; this is not complete TU coverage.

### shard-main__melee__it__kinds__itleadead-015
Reviewed the six assigned helpers and their relevant local callers. They initialize timed movement state 4 and reaction states 15/16, transform collision-box profiles, compare fighter-side orientation, and implement a cooldown/random/proximity gate. State 16 subtracts fall speed from vertical velocity; state 15 has an empty physics callback, which alone does not establish that it is stationary. Gameplay mappings beyond these demonstrated operations remain deferred.

### shard-main__melee__it__kinds__itleadead-016
Reviewed the six assigned helpers and their relevant local and fighter-side callers. They implement a facing-relative floor predicate with stored-wall fallback, conditional actor creation and initialization, fighter attachment setup, shared attachment teardown, and interruption release selecting grounded or airborne motion. The wall fallback does not recompute collision after applying offsets. Visual knockdown/revival and biting terminology remains less firmly established than the directly observed state transitions.

### shard-main__melee__it__kinds__itleadead-017
The reviewed capture path stores a fighter and attachment part on the item. CaptureLeadead timer processing invokes it_802EAE80 before transitioning the fighter to CaptureCut. The item clears its attachment bookkeeping and selects grounded state 6 or airborne state 10. Destruction conditionally performs the same attachment cleanup and fighter release before calling shared destruction handling. The translation unit contains a multi-entry ItemStateTable; this review does not establish complete TU coverage.

### shard-main__melee__it__kinds__itleadead-018
The six assigned parameter subjects belong to callbacks declared with an `Item_GObj* gobj` argument. Motion10's animation callback ignores that argument and returns false; its physics callback reads item fall-speed attributes and forwards them with the object, while its collision callback forwards the object to two helpers. Motion11 and Motion12 animation callbacks decrement a positive item counter and perform distinct actions when the counter is zero and the item is grounded. Motion12's collision callback branches on airborne status and collision-result bits. All six subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__it__kinds__itleadead-019
The six assigned parameter subjects have no baseline facts to disposition. Their current function definitions all accept `Item_GObj* gobj`. Motion12 physics subtracts the item's fall-speed attribute from vertical velocity only while airborne. Motion13 animation conditionally reselects state 13 and returns false; its physics callback is empty. Motion14 animation conditionally reselects state 14 and returns false; its physics callback forwards the object and two fall-speed attributes to `it_80272860`, while its collision callback returns `it_8027C824(gobj, NULL)`. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itleadead-020
The six assigned parameter subjects have no baseline facts. In the current source, both animation callbacks ignore their Item_GObj* argument and return false. Motion15 physics is empty; its collision callback forwards the argument to it_8027C79C. Motion16 physics obtains the Item from the argument and subtracts the configured fall speed from vertical velocity; its collision callback forwards the argument to it_8027C794. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itleadead-021
Reviewed the six assigned callback-parameter subjects; all have empty baseline fact lists. Their canonical functions take `Item_GObj* gobj`. Both animation callbacks ignore that argument and return false. Motion1 physics accesses the item's x48 counter: zero invokes two helpers and returns; otherwise it invokes another helper and decrements the counter. Motion1 collision forwards the object to two helpers. Motion17 physics subtracts the item's fall-speed attribute from vertical velocity, and its collision callback returns a helper's result. These observations do not establish gameplay names or compiled register placement.

### shard-main__melee__it__kinds__itleadead-022
The six assigned parameter subjects correspond to the `Item_GObj* gobj` arguments of motion-2 and motion-3 callbacks. Motion 2 forwards this object to helpers and uses its item data to initialize velocity, update counters, and conditionally dispatch transitions. Motion 3's animation callback updates the item's countdown and reverses facing when the countdown is zero; its collision callback forwards the object to helpers, while its physics callback does not use the argument. All six subjects have empty baseline fact lists, so there are no fact dispositions.

### shard-main__melee__it__kinds__itleadead-023
The six assigned parameter subjects belong to callbacks taking `Item_GObj* gobj`. Motion4 Anim ignores its argument and returns false; Motion4 Phys accesses the item's attributes and counter, sets horizontal velocity after counter thresholds, and increments the counter. Motion4 Coll passes the object through collision helpers and conditionally transitions state, then processes velocity against the floor normal. Motion5 Anim uses the object to restart state 5 when its animation check returns zero and restores a joint's Z translation from item state. Motion5 Phys is empty, and Motion5 Coll ignores its argument and returns false. All six subjects have empty baseline fact lists; no fact dispositions or proposals are needed.

### shard-main__melee__it__kinds__itleadead-024
The six assigned parameter subjects correspond to the `Item_GObj* gobj` arguments of the motion-6 and motion-7 callbacks. Motion 6's animation callback obtains item attributes and conditionally resets two fields before forwarding the object to a transition helper; its physics callback is empty. Motion 7's animation callback advances a counter, updates collision bounds through a helper, and eventually enters another state; its physics callback passes velocity, floor normal, facing, and the object to helpers. Both collision callbacks forward the object to collision helpers. No baseline facts exist for any of the six subjects.

### shard-main__melee__it__kinds__itleadead-025
Reviewed the six assigned parameter subjects for motion 8 and 9 callbacks. Their current definitions all accept `Item_GObj* gobj`. Motion 8 animation ignores the parameter and returns false; its physics callback accesses item data, decrements x48 or enters state 9, and invokes two movement helpers. Motion 9 animation accesses item data, selects helper arguments according to x44, increments that counter, and invokes a transition helper when an animation query returns zero; its physics callback is empty. Both collision callbacks forward gobj to the same two helpers. All six subjects have empty baseline fact lists, so there are no fact dispositions.

### shard-main__melee__it__kinds__itleadead-026
The six assigned parameter subjects correspond to functions whose canonical first argument is `Item_GObj* gobj`. Their bodies use that object to access item state or forward it to an inline implementation. The reviewed routines initialize item fields, branch on accumulated values and current motion state, and configure velocity, facing, counters, and motion transitions. All six subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__it__kinds__itleadead-027
The six assigned parameter subjects correspond to functions whose current source accepts an Item_GObj* named gobj. Each obtains item data from that object and initializes a state transition: it_802E9494 adjusts velocity, facing and counters before selecting state 12; it_802E9738 resets velocity and counters before state 7; it_802E98E0 resets velocity, clears a flag and initializes a counter before state 8; it_802E9A00 clears counters before state 9; it_802E9BA0 resets velocity and initializes a counter before state 3; and it_802E9D50 clears a counter and resets velocity before state 4. These are source-level observations, not verified register-layout or gameplay mappings. All six subjects have empty baseline fact arrays.

### shard-main__melee__it__kinds__itleadead-028
The assigned subjects have no baseline facts. Their current containing functions accept an item object: it_802EA2A0 restores initial facing, clears xDEC, and selects state 0xF; it_802EA334 passes item velocity to a helper and selects state 0x10. it_802EA478 adjusts an ECB using two integer selectors, applies it, and synchronizes collision facing. it_802EA674 compares item facing with the horizontal direction toward a fighter returned by a lookup, returning 1 on mismatch and 0 otherwise. This review covers only the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itleadead-029
The assigned subjects have no baseline facts. Current source shows that it_802EA6F4 consumes an item object, decrements a nonzero counter, and otherwise conditionally tests a fighter's proximity after a randomized gate. it_802EA804 consumes an item object and floating-point range, compares floor-query geometry, and falls back to it_802EA988. The latter copies item collision data, changes only the copy's position using floating-point offsets, and returns a value based on existing wall flags; it performs no collision query using the changed position. Register-labelled parameter identities are not established by these C bodies.

### shard-main__melee__it__kinds__itleadead-030
The assigned subjects have no baseline facts. In the current source, `it_802EA9FC` accepts a position pointer and integer facing value, forwards the position to `it_8027B5B0`, and initializes the returned item's facing when non-null. `it_802EAAEC` accepts an item object, fighter object, integer part and unused floating-point argument; it modifies the item, forwards the fighter and part to `it_80274FDC`, and stores both for subsequent use. These source-level observations do not establish register-slot identities.

### shard-main__melee__it__kinds__itleadead-031
The three assigned parameter subjects have no baseline facts. Their current function definitions each accept `Item_GObj* gobj`. `it_802EAC8C` updates that item's position using its stored fighter/part reference and offset, clears those references, resets joint translation and item-specific fields, and invokes cleanup helpers. Both `it_802EADD8` and `it_802EAE80` call this routine before branching on ground/air status; their grounded paths differ. This review is limited to the assigned subjects, not complete TU coverage.

### shard-main__melee__it__kinds__itleadead-032
The reviewed callbacks implement counter-controlled horizontal movement, timed state transitions, collision-box adjustment, thrown-state initialization, and destruction cleanup involving a stored fighter pointer. The shared motion-12 collision callback explicitly dispatches between airborne and grounded paths. These mechanisms alone do not establish the proposed ReDead gameplay identity.

### shard-main__melee__it__kinds__itleadead-033
The reviewed functions participate in the Leadead item state machine: fighter-relative facing and proximity decisions, collision callback dispatch, an empty physics phase, falling physics, terrain-gated damage reactions, and fighter-attachment cleanup. Fighter-side callers confirm mash-shortenable capture and separate damage/death interruption paths. The code establishes these mechanics, but does not independently establish the external ReDead identity or the visual knockdown/revival interpretation.

### shard-main__melee__it__kinds__itleadead-034
The reviewed functions initialize item-local state, manage timed motion transitions, process terrain and animation completion, and update vertical velocity. State 8 counts down into state 9, whose staged updates eventually return to state 1. Motion 16 directly subtracts configured fall speed from vertical velocity. These observations support the gravity link, but do not independently establish the public ReDead identity or animation meanings. Coverage is limited to the assigned links and supporting source.

### shard-main__melee__it__kinds__itleadead-035
The reviewed Leadead code implements facing-directed velocity initialization, a timed state sequence, pickup/drop/throw callbacks, and fighter-capture integration. Motion 13 has an empty physics callback. These mechanisms are supported by current source; their identification with the player-facing ReDead enemy and collapse/revival animations remains unverified in this bounded review.

### shard-main__melee__it__kinds__itleadead-036
The reviewed callbacks implement facing-scaled movement resets, collision-helper dispatch, counter-driven state progression, a same-state animation restart, and cleanup of a stored fighter attachment. State 7 advances through staged helper arguments into state 8; state 8 counts down before entering state 9. These mechanics are supported by current source, but the assigned links' external ReDead identity and collapse/revival interpretations are not independently established by the reviewed code.

### shard-main__melee__it__kinds__itleadead-037
The reviewed callbacks implement animation looping, timed facing reversal and forward movement, floor-relative physics, a gravity-driven state, pickup/drop transitions, and cleanup of an associated fighter. Several animation callbacks simply return false; associated physics callbacks perform the timed work. The current code supports these mechanisms, but the reviewed evidence does not independently establish the Leadead-to-ReDead game-concept mapping.

### shard-main__melee__it__kinds__itleadead-038
The reviewed callbacks implement cumulative-value reaction branching, timed transitions through states 7–9, facing reversal and movement resumption, collision-helper delegation, and state-14 initialization. State 15's physics callback is empty. These mechanisms are directly visible; their proposed ReDead gameplay identities and animation meanings are not independently established by the inspected code.

### shard-main__melee__it__kinds__itleadead-039
The reviewed callbacks implement item-state transitions, collision delegation, conditional vertical acceleration, and actor creation. The state-7 initializer leads through a timed state 8 and state 9 back to state 1. Canonical code supports these mechanics, but the reviewed evidence does not independently establish the external ReDead identity or the gameplay labels collapse and revival.

### shard-main__melee__it__kinds__itleadead-040
The reviewed callbacks belong to an item-state dispatch table. They include unconditional and airborne-only downward acceleration, collision-dependent velocity reset, timed state transitions, floor-normal-dependent helper calls, and an empty physics callback. These source observations support the two gravity links, but do not independently establish the public ReDead identity or compiled .data placement.

### shard-main__melee__it__kinds__itleadead-041
The reviewed callbacks implement timer-driven item motion transitions, fighter-proximity testing, collision dispatch, and dropped/thrown lifecycle setup. Motion 13 physics is an installed empty callback. Current code supports these mechanics, but does not independently establish the proposed ReDead gameplay identity or collapse/recovery animation meanings.

Status: researched; no-change lead bypass; independent review and live promotion pending.
