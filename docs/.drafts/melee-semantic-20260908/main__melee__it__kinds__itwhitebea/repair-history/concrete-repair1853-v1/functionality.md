# Disjoint Librarian Research

### shard-main__melee__it__kinds__itwhitebea-000
Reviewed canonical and rendered itwhitebea.c lines 1–480, with lines 481–498 read to finish the boundary function and inspect its adjacent physics callback; this is not complete TU coverage.

The assigned range defines a twelve-entry callback table, including reused animation indices and a NULL collision callback for entry 8. Oldottosea-named callbacks implement repeated state requests, linked-object cleanup, and vertical acceleration. A bounds/link-maintenance routine sets a termination flag outside stage boundaries, calls cleanup and returns true when flagged, otherwise computes three-dimensional separation from a linked object and applies distance-dependent calls using state-dependent horizontal-velocity scaling.

The Whitebea portion initializes facing and counters, branches on an accumulated value versus an attribute threshold (or state 9), requests a small camera quake on that branch, and randomly selects one of two subsequent routines. States 0 and 1 alternate through counters and randomized durations: state 1 initializes facing-scaled horizontal velocity, periodically issues fixed and surface-derived sound calls, and invokes collision-dependent transitions. Entry to state 3 clears the wait counter, scales horizontal velocity, and reverses facing when horizontal nudge opposes it.

### shard-main__melee__it__kinds__itwhitebea-001
Reviewed canonical and rendered itwhitebea.c lines 481–866 only.

- Motion 3 has a no-op animation callback, delegates physics using fall-speed attributes, and delegates collision handling with fn_802E398C as a callback.
- Motion 4 initialization conditionally scales velocity, restores initial facing, and synchronizes collision facing. Its physics subtracts fall speed only while airborne; its animation and collision callbacks can route to it_802E40A4. That routine restores facing-scaled horizontal velocity, zeros vertical/depth velocity, conditionally randomizes x3C, sets x44 to 4, and enters motion 1.
- Motion 2 initialization resets velocity and sets x40 to 15. Its animation callback reverses facing when x40 is zero, decrements the counter, and conditionally restores the same motion-1 movement setup.
- Motions 5–7 form a timed sequence: motion 5 initializes x40 to 20, then routes to motion 6 when the animation helper returns false or the counter reaches zero. Motion 6 initializes vertical velocity from special attribute x10; its collision callback supplies the motion-7 initializer. That initializer calls grIceMt_801FA6D8. Motion 7 subsequently sets x3C to 1 and x40 from special attribute x14 before entering motion 0.
- The pickup callback enters motion 8. The drop callback clears x40, scales horizontal velocity, conditionally reverses facing against horizontal nudge, and enters motion 3. The throw callback clears x40, sets x3C to 1, and enters motion 9. Motions 8 and 9 conditionally restart themselves; motion 9 delegates physics and collision processing.
- Motion 10 initialization clears x18 after helper calls; its animation callback conditionally restarts motion 10 and its physics callback is empty. Motion 11 initialization passes velocity to it_8027BA54; its physics directly subtracts fall speed. The final two-object routine forwards both arguments to it_8026B894.

### shard-main__melee__it__kinds__itwhitebea-002
The assigned header range provides declarations, not executable behavior. It includes item forward/type definitions and declares Oldottosea-prefixed motion callbacks for indices 8–11, Whitebea-prefixed callbacks for indices 0–11, and additional item-object entry points. Animation and collision callbacks return `bool`; physics callbacks return `void`. Most functions accept one `Item_GObj*`, while `it_802E3784` and `it_802E4A24` accept two. The header also exposes the unsized external `ItemStateTable` array `it_803F8A88`. This review covers only `itwhitebea.h` lines 1–83, not the complete translation unit.

### shard-main__melee__it__kinds__itwhitebea-003-recovery5
The assigned subjects cover Whitebea's twelve-row motion callback table, its state-3 collision transition into state-0 waiting/action selection, and Oldottosea's state-10 callbacks. The latter conditionally requests state 10, performs no callback-local physics work, and delegates collision handling to a shared contact counter that reports completion after exceeding a configured limit. Whitebea's jump sequence selects states 5–7 and calls the stage routine on entering state 7. Compiled data-section layout and stronger gameplay mappings remain deferred. This review does not claim complete TU coverage.

### shard-main__melee__it__kinds__itwhitebea-004
The assigned Oldottosea callbacks implement constant-false animation handling and vertical-velocity decrement for state 11, delegation to a shared bounds/association helper, an empty state-8 physics callback, and predicate-gated same-state restarts for states 8 and 9. State 8 additionally invokes association-clearing helpers. The shared collision helper detaches rather than destroys the referenced object; its true-return branch also accepts an already-set removal flag. Gameplay identities and cross-union field equivalence remain unverified.

### shard-main__melee__it__kinds__itwhitebea-005
Reviewed the six assigned subjects, not the complete translation unit. Oldottosea state 9 forwards common fall attributes to the vertical-velocity helper and delegates collision handling with a null continuation. Whitebea state 0 repeats its animation, decrements a wait counter, and selects horizontal movement or a timed preparation sequence leading to vertical motion. Its collision callback refreshes floor support and invokes the state-3 transition on support loss. The pickup callback unconditionally requests state 8, whose animation repeats and whose physics callback is empty. Gameplay identity and stage-scrolling claims are deferred where the inspected code does not establish them.

### shard-main__melee__it__kinds__itwhitebea-006-recovery7
Reviewed the six assigned callbacks for Whitebea states 10 and 11. State 10 conditionally requests itself again when it_80272C6C returns false, has an empty physics callback, and forwards collision processing to it_8027C79C. State 11 has a constant-false animation callback, subtracts the configured fall-speed attribute from vertical velocity, and forwards its collision result from it_8027C794. The state-11 entry passes the velocity vector to a shared helper; a threshold-or-state-9 branch randomly selects this entry or state 10. Gameplay identities and terminal-motion interpretations remain deferred rather than inferred from rendered names.

### shard-main__melee__it__kinds__itwhitebea-007
Reviewed the six assigned state-1/state-2 callbacks and their relevant transition and shared-helper code. State 1 maintains timed, floor-oriented movement and recurring collision-line-selected sounds; edges or walls request state 2, while support loss requests state 3. State 2 reverses facing when its counter begins an update at zero and restores state-1 movement when the model-status predicate becomes false. Its physics callback is empty. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itwhitebea-008-recovery7
Reviewed the six assigned motion-3 and motion-4 callbacks. Motion 3 has an inert animation callback, attribute-driven vertical acceleration, and collision delegation with a state-0 contact callback. Motion 4 repeats its animation in air or invokes its grounded follow-up when the shared predicate returns zero; physics subtracts fall acceleration only in air, and collision selects airborne-contact or grounded-support processing. Both collision callbacks return false through it_8027C794. The gravity helper tests velocity before subtracting acceleration; it does not clamp the resulting velocity.

### shard-main__melee__it__kinds__itwhitebea-009
Reviewed the six assigned state-5/state-6 callbacks and their immediate transition paths. State 5 initializes x40 to 20; its animation callback decrements a nonzero counter while the model predicate succeeds, otherwise invoking the state-6 initializer. Its physics callback is empty and its collision callback delegates support processing. State 6 assigns attribute x10 to vertical velocity, has a constant-false animation callback, delegates vertical acceleration to the common item helper, and delegates collision processing with a state-7 transition callback. That transition calls grIceMt_801FA6D8. Attribute positivity, exact gameplay identity, and screen-scrolling effects are not established by the inspected bodies.

### shard-main__melee__it__kinds__itwhitebea-010
Reviewed the six assigned callback subjects, not the complete translation unit. State 7's animation callback conditionally initializes x3C and x40 and selects state 0; its physics callback is empty, and its collision callback refreshes floor contact or invokes the state-3 transition. State 8 has an empty physics callback and no collision callback; its animation callback conditionally reselects state 8. State 9's animation callback similarly reselects state 9. Both same-state transitions test the negated result of it_80272C6C.

### shard-main__melee__it__kinds__itwhitebea-011-recovery7
Reviewed the six assigned subjects, not the complete translation unit. Whitebea's dropped callback clears x40, scales horizontal velocity, conditionally reverses facing against horizontal nudge, and requests state 3. Its thrown callback clears x40, sets x3C, and requests state 9; that state's physics and collision callbacks delegate to shared helpers. Logic3 destruction conditionally clears the referenced Freeze object's field before calling local cleanup and shared destruction. it_802E31F8 conditionally performs analogous cleanup before requesting state 8. The local cleanup helper actually writes freeze.x20; equivalence to whitebea.x20 remains unverified.

### shard-main__melee__it__kinds__itwhitebea-012
Reviewed the six assigned functions and supporting canonical bodies, not the entire translation unit. The first two routines reset x28 and request states 4 and 9, respectively; the state-4 initializer also scales horizontal velocity. The damage handler selects between the state-10 and state-11 initializers after its damage/state guard. State 11 subtracts fall acceleration from vertical velocity. The bounds helper checks four blast-zone boundaries and otherwise performs distance-dependent maintenance of an associated Freeze object. The final wrapper delegates object-reference cleanup. Gameplay identity, exact lifecycle naming, attribute attenuation, and cross-union association clearing have evidentiary limitations described below.

### shard-main__melee__it__kinds__itwhitebea-013-retry154532
Reviewed the six assigned functions and relevant local transitions and shared helpers. The code provides a null-guarded pointer clear, Whitebea initialization, accumulated-hit response dispatch, timed horizontal movement entry, falling-state entry, and state-4 knockback setup. The knockback transition explicitly sets GA_Air before calculation, causing the current shared helper to return false and selecting grounded horizontal damping. Corrections distinguish multiplication from proven attenuation and the current camera-quake call from an obsolete symbol. Cross-union pointer compatibility and external enemy/stage mappings remain deferred; this is not complete TU coverage.

### shard-main__melee__it__kinds__itwhitebea-014
Reviewed the six assigned state-entry helpers and their local callers and successor callbacks. They restore facing-directed state-1 movement, stop movement and initialize the state-2 turnaround counter, initialize a 20-update state-5 delay, copy an attribute into vertical velocity and enter airborne state 6, enter grounded state 7 and call the stage routine, or clear x18 and enter looping state 10. State 10 is selected by a threshold-or-state-9 branch that randomly chooses between states 10 and 11. Gameplay identity, upward launch speed, original names, and the stage call's visible effect remain partly unverified; this is not a complete TU review.

### shard-main__melee__it__kinds__itwhitebea-015
Reviewed the assigned baseline subjects, not the complete translation unit. it_802E4980 prepares the item's velocity and enters state 11, whose physics decreases vertical velocity. Its caller selects it probabilistically after an accumulated-response threshold or state-9 condition. it_802E4A24 forwards two objects to shared relationship-reference cleanup. The unit also contains a twelve-entry Whitebea callback table, Oldottosea-prefixed companion-management routines, and a state-6 → state-7 → state-0 sequence.

### shard-main__melee__it__kinds__itwhitebea-016
The six assigned parameter subjects have no baseline facts. Their canonical function definitions all declare an Item_GObj* gobj parameter. Motion8_Phys and Motion10_Phys are empty; Motion11_Anim ignores the parameter and returns false. Motion11_Phys accesses the item and subtracts its fall-speed attribute from vertical velocity. Motion11_Coll forwards the object to it_802E35CC and returns its result. Motion8_Anim conditionally processes the referenced x20 object and requests motion 8, then returns false. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itwhitebea-017
The six assigned parameter subjects have no baseline facts. Their canonical functions each accept `Item_GObj* gobj`. The Oldottosea motion-9 animation callback conditionally requests motion 9 and returns false; its physics callback forwards the object's fall-speed attributes to it_80272860, and its collision callback returns it_8027C824(gobj, NULL). The WhiteBea pickup callback requests motion 8. Whitebea motion-0 animation conditionally requests motion 0 and returns false; its collision callback passes the object and it_802E3DA0 to it_8026D62C before returning it_8027C794(gobj).

### shard-main__melee__it__kinds__itwhitebea-018
The six assigned parameter subjects have no baseline facts to disposition. Their current functions take `Item_GObj* gobj`. Motion0 physics obtains item data, decrements a nonzero x40 counter, or selects between two helper calls when the counter is zero. Motion10 animation conditionally requests motion 0xA and returns false; its physics callback is empty and its collision callback forwards gobj to it_8027C79C. Motion11 animation ignores gobj and returns false; its collision callback forwards gobj to it_8027C794. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itwhitebea-019
The six assigned parameter subjects have no baseline facts to disposition. Their current function definitions take `Item_GObj* gobj`. Motion-1 callbacks access item timers, request state changes, adjust velocity through helpers, and forward the object to collision helpers. Motion-2 animation updates facing direction and velocity before requesting state 1; its collision callback forwards the object to two helpers. Motion-11 physics subtracts the item's configured fall-speed value from vertical velocity. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itwhitebea-020
The six assigned parameter subjects have no baseline facts. Their canonical functions accept `Item_GObj* gobj`: motion-2 physics is empty, and motion-3 animation returns false without using the argument. Motion-3 physics reads item attributes and forwards the object with fall-speed parameters; its collision callback forwards the object to collision helpers. Motion-4 animation and collision inspect the item's ground/air state and select transitions or collision callbacks accordingly. This review covers only these assigned subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itwhitebea-021
The six assigned parameter subjects have no baseline facts. Their current functions declare an `Item_GObj* gobj` argument. Motion4 physics uses the object's item data to subtract fall speed from vertical velocity only while airborne. Motion5 animation decrements a counter or invokes the transition helper; Motion5 physics is empty, and its collision callback forwards the object to collision helpers. Motion6 animation returns false without using the argument; its collision callback forwards the object and a transition callback to a collision helper.

### shard-main__melee__it__kinds__itwhitebea-022
The six assigned parameter subjects have no baseline facts to disposition. Their current functions take `Item_GObj* gobj`. Motion6 physics obtains item attributes and passes the object plus fall-speed attributes to `it_80272860`. Motion7 animation conditionally updates item fields and requests state 0; its collision callback passes the object to two collision helpers. Motion8 animation conditionally requests state 8. Motion7 and Motion8 physics bodies are empty and do not use their parameters. This review covers only the assigned subjects.

### shard-main__melee__it__kinds__itwhitebea-023
The six assigned parameter subjects have no baseline facts. Their current function definitions each take `Item_GObj* gobj`. The motion-9 animation callback conditionally reissues state 9 and returns false; its physics callback forwards the object's fall-speed attributes to `it_80272860`; its collision callback returns `it_8027C824(gobj, NULL)`. Dropped handling resets x40, scales horizontal velocity, conditionally reverses facing and collision facing, and requests state 3. Thrown handling resets x40, sets x3C to 1, and requests state 9. Destroyed handling conditionally passes the referenced x20 object to `it_8028ECE0`, then calls `it_802E37A4` and `it_2725_Logic9_Destroyed` with the original object.

### shard-main__melee__it__kinds__itwhitebea-024
The six assigned parameter subjects have no baseline facts. Their current function definitions each accept `Item_GObj* gobj`, obtain item data from that object, and pass it to item helpers. Five functions update fields and request numbered motion states; `it_802E35CC` checks stage bounds and conditionally processes the object referenced by `whitebea.x20`, using distance thresholds and scaled horizontal velocity. This review is limited to the assigned subjects and does not establish compiled register mappings or gameplay meanings for numeric states.

### shard-main__melee__it__kinds__itwhitebea-025
The assigned subjects have no baseline facts. Their enclosing canonical functions forward two object arguments unchanged, conditionally clear an item's freeze.x20 pointer, initialize item facing and flags, branch on an accumulated value and motion state, and configure horizontal velocity, counters, and motion state 1. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itwhitebea-026
The six assigned parameter subjects belong to state-entry routines taking an Item_GObj pointer. These routines access the object's Item data to update velocity, facing direction, counters, and motion state. The reviewed bodies cover entry into states 3, 4, 1, 2, 5, and 6; state 5's animation callback advances to state 6 when its animation finishes or its counter reaches zero. All six subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition. This review does not claim complete translation-unit coverage.

### shard-main__melee__it__kinds__itwhitebea-027
The assigned subjects cover parameters of four functions. it_802E4558 operates on an item object, invokes item helpers, selects state 7, and calls grIceMt_801FA6D8. it_802E48B4 clears whitebea.x18 and selects state 10 after helper calls. it_802E4980 passes the item's velocity to a helper and selects state 11. it_802E4A24 forwards its two Item_GObj pointers to it_8026B894. All five assigned subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__it__kinds__itwhitebea-028
The reviewed callbacks include predicate-gated motion updates, collision-helper dispatch, vertical-velocity reduction, associated-object teardown, and a two-argument forwarding wrapper. The motion-6 collision path supplies a callback that installs motion 7 and calls grIceMt_801FA6D8. These local mechanics are visible in canonical source; actor identities and several shared-helper semantics remain unverified in this bounded review.

### shard-main__melee__it__kinds__itwhitebea-029
The reviewed callbacks perform guarded motion-state updates, pickup and released-item state setup, collision delegation, companion-object maintenance, and vertical acceleration. Two assigned physics callbacks have empty bodies. Current code supports these local behaviors, but the reviewed evidence does not independently establish the English gameplay identities asserted by several links. This review covers only the assigned links.

### shard-main__melee__it__kinds__itwhitebea-030
Reviewed the assigned link targets against current canonical implementations. These implement conditional airborne acceleration, timed state transitions, horizontal movement initialization, damage-dependent reactions, companion-reference clearing, and pickup/throw-related callbacks. The code supports these mechanics but does not independently establish the proposed English enemy identities.

### shard-main__melee__it__kinds__itwhitebea-031
Reviewed the assigned callback links against current canonical bodies. Confirmed direct gravity updates and ground/air collision dispatch. The inspected Whitebea routines implement timed movement, facing reversal, a timed transition into vertical motion, and a collision-triggered stage call. These mechanics alone do not establish the asserted named gameplay-entity mappings.

### shard-main__melee__it__kinds__itwhitebea-032
The reviewed routines initialize motion states, choose timed movement branches, set horizontal or vertical velocity, restart state animations conditionally, and clear an optional linked-object field. The source includes a twelve-entry callback table and an empty Oldottosea physics callback. Gameplay identities and compiled data-section identity are not established by these bounded reads.

### shard-main__melee__it__kinds__itwhitebea-033
The reviewed callbacks implement timer-controlled horizontal movement, facing reversal, a timed transition to vertical motion, falling-physics delegation, and dropped/thrown state changes. The state-0 animation callback conditionally re-enters state 0 rather than selecting a different state. The unit also contains distinct Oldottosea callbacks. These bounded source reads establish behavior but do not independently establish the proposed English gameplay identities.

### shard-main__melee__it__kinds__itwhitebea-034
The reviewed callbacks initialize motion states, adjust release velocity and facing, branch on ground/air collision status, conditionally restart animation states, and forward object-reference callbacks. The unit also manages an associated object through the itfreeze interface. These local behaviors do not independently establish the proposed Topi, Polar Bear, or Freezie gameplay identities.

### shard-main__melee__it__kinds__itwhitebea-035
The reviewed callbacks implement timed movement and facing reversal, falling, a vertical-launch sequence whose subsequent state transition calls the stage module, pickup-state entry, and reference-management operations. The Oldottosea callback sequence also checks blast-zone bounds and maintains a linked object's separation and velocity. These code behaviors support portions of the link rationales, but do not independently establish the asserted English gameplay identities.

### shard-main__melee__it__kinds__itwhitebea-036
The reviewed callbacks include state-8 pickup presentation with an empty physics callback, direct downward acceleration, ground/air-dependent collision dispatch, and animation-driven state transitions. Current code supports these mechanical relationships; the supplied Polar Bear and Topi identity claims require independently verified game-mapping evidence.

### shard-main__melee__it__kinds__itwhitebea-037
The assigned animation callback conditionally reapplies motion state 0 with ITEM_ANIM_UPDATE when it_80272C6C returns false, and always returns false. Its paired physics callback separately counts down x40 or chooses between two transition helpers based on x3C and a random draw. This supports a looping state, but does not independently establish the Polar Bear gameplay identity.

Status: researched; no-change lead bypass; independent review and live promotion pending.
