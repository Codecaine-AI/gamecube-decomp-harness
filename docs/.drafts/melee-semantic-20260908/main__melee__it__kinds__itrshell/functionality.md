# Disjoint Librarian Research

### shard-main__melee__it__kinds__itrshell-000
Reviewed canonical and rendered itrshell.c lines 1–480 only. This range defines an eight-entry callback table, attribute-driven effect timing, horizontal-velocity responses, counter/flag bookkeeping, speed clamping and reversal, initialization, and callbacks for states 0–4. Two response routines replace horizontal velocity in states 0, 1, 3, 4 and 7, add to it in states 5 and 6 while decrementing a counter, and select different follow-up calls according to speed threshold and ground/air status. Spawn initialization seeds counters and flags before selecting state 1. State-0 setup clears velocity and installs a jumped_on callback. Pickup, thrown and dropped entry points select states 2, 3 and 4 respectively; states 3 and 4 share countdown logic, physics-helper arguments and a collision callback target.

### shard-main__melee__it__kinds__itrshell-001
Reviewed only itrshell.c lines 481–788, in both canonical and rendered views. Shared initialization resets counters and configures transitions to motion IDs 5 and 6, preserving hits except when entered from IDs 0, 1, or 7; the ID-5 initializer also zeros vertical velocity. Motion-5 animation decrements counters and returns true when xDD4 is exhausted. Its physics periodically obtains a target position, sets horizontal acceleration according to relative X, and updates velocity; collision handling can reverse both horizontal velocity and acceleration or invoke the ID-6 initializer, and adds speed-scaled child-joint Y rotation while grounded. Motion-6 animation has similar counter processing but always returns false, including at exhaustion; its physics delegates using fall-speed attributes. EnteredAir sets a flag and requests ID 7, whose animation and physics do no work while its collision callback delegates and conditionally updates rolling rotation. Remaining event callbacks dispatch response helpers, propagate xDF0 in selected cases, reset xDD4 from the half-life timer on reflection, and select different shield responses by motion ID.

### shard-main__melee__it__kinds__itrshell-002
The assigned header declares the module's item-object interface, not its implementation. It exposes single-item helper and callback signatures, including animation/physics/collision declarations grouped under UnkMotion0–7; the UnkMotion2 group contains only animation and physics declarations here. Most helpers return void, animation/collision callbacks return bool, and it_8028D56C returns f32 while accepting an item object and two f32 arguments. The header also declares a two-item event callback and an externally defined ItemStateTable array of unspecified length. No function bodies, state-table contents, or runtime behavior are established by this bounded header review.

### shard-main__melee__it__kinds__itrshell-003
The assigned subjects include an eight-row shell state table, compiler-section hypotheses, a horizontal reversal callback, and two event adapters. The reversal negates velocity and cached acceleration before calling the shared facing updater. The clank adapter forwards its object to the bounce helper and returns false; the unknown-event adapter forwards two pointers without local logic. Source confirms timer and steering arithmetic, but does not establish the claimed compiled small-data layouts.

### shard-main__melee__it__kinds__itrshell-004
Reviewed the six assigned subjects and all 31 baseline facts. Pickup forwards the object to shared setup and requests state 2. Reflection copies the post-helper half-life timer into a shell-local countdown and returns false. Shield bounce delegates only in states 3 and 4. State 0 has inert animation and physics callbacks; its collision callback delegates contact processing and conditionally updates rolling rotation when grounded. Gameplay interpretations, historical naming, and dispatcher-dependent lifetime claims remain explicitly deferred where the locally read bodies do not establish them.

### shard-main__melee__it__kinds__itrshell-005
Reviewed the six assigned callbacks, not the complete translation unit. State 1 has inert animation, delegated fall acceleration, and xDE8-dependent collision dispatch. Pickup selects state 2, whose animation and physics callbacks are inert. State 3 decrements xDD8 while positive; on a subsequent update with a nonpositive value, it conditionally sets three item flags. The gravity helper gates acceleration rather than clamping velocity.

### shard-main__melee__it__kinds__itrshell-006
The assigned callbacks separate thrown/dropped falling physics, delayed flag updates, and terrain processing. Both collision callbacks pass the same landing initializer to common terrain handling and return false. The initializer zeroes vertical velocity, prepares runtime fields, selects state 5, and assigns horizontal velocity. State-5 animation maintains two countdowns, returns true when its primary countdown is already nonpositive, and conditionally invokes a periodic effect update. This review covers only the six assigned subjects.

### shard-main__melee__it__kinds__itrshell-007
Reviewed the six assigned subjects. State 5 physics periodically acquires a target position, caches signed horizontal acceleration, limits horizontal speed, and updates facing; it does not reinitialize state 5 or disable motion. Its collision callback reverses horizontal velocity and acceleration on a secondary collision result and performs ground-only model rotation on the maintained-contact branch. State 6 separates nested countdown maintenance, threshold-gated falling physics, and collision dispatch to a callback that restores state 5. State 7 animation is inert. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itrshell-008
The assigned callbacks initialize drop and entered-air transitions, provide an empty state-7 physics phase and grounded-only rolling-rotation handoff, and delegate damage reactions to shell-specific helpers. Damage dealt decrements xDEC and returns the persistent xDF0 status; damage received replaces or adds horizontal velocity according to the current state and selects a speed-dependent response. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itrshell-009
Reviewed the six assigned subjects. Spawn initializes shell variables and requests state 1; throwing resets two variables, requests state 3, and starts sound 242. Shield-hit handling selects between a bounce and a shell-specific helper. The periodic effect helper emits effect 1029 using an attribute offset and countdown. The landing helper initializes state 5 and computes horizontal velocity. Damage response replaces, accumulates, or preserves horizontal velocity before speed-dependent dispatch. Gameplay interpretations beyond these inspected operations remain explicitly deferred.

### shard-main__melee__it__kinds__itrshell-010
Reviewed the six assigned helpers and their local callers. They implement jumped-on velocity responses, exact-zero interaction-budget exhaustion, conditional post-contact continuation, horizontal-speed clamping, an attribute-weighted velocity calculation, and stationary state-0 initialization with a jumped-on callback. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itrshell-011
The assigned subjects cover entry into falling state 1, paired active-state initializers for grounded state 5 and airborne state 6, the jumped-on callback, and baseline translation-unit descriptions. The active initializers share timer/reset and horizontal-speed setup, conditionally request hitbox preservation, and differ in selected state and vertical-velocity reset. The jumped-on response replaces or adds horizontal velocity according to the current state, can decrement an interaction counter, and returns xDF0. The eight-row state table connects these routines to falling, target-position-directed movement, terrain reversal, and item-event callbacks. This is a bounded subject review, not a complete TU verification.

### shard-main__melee__it__kinds__itrshell-012
Reviewed the canonical bodies associated with the six assigned parameter subjects. Clanked forwards its object to itColl_BounceOffVictim and returns false. EvtUnk forwards both object arguments, in order, to it_8026B894. PickedUp passes its object to it_80275474 and requests state 2 with ITEM_ANIM_UPDATE. Reflected calls it_80273030, copies xD48_halfLifeTimer into rshell.xDD4, and returns false. ShieldBounced calls itColl_BounceOffShield only when msid is 3 or 4, then returns false. All assigned subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__it__kinds__itrshell-013
The six assigned parameter subjects have no baseline facts. In the current source, all six corresponding callbacks declare an Item_GObj* parameter named gobj. Both animation callbacks ignore it and return false; motion-0 physics is empty. Motion-0 collision passes the object to collision handling, obtains its item and joint, and conditionally updates rolling rotation when grounded. Motion-1 physics obtains item fall-speed attributes and passes them with the object to it_80272860. Motion-1 collision selects between two helper paths using rshell.xDE8.

### shard-main__melee__it__kinds__itrshell-014
The six assigned parameter subjects correspond to callbacks declared with one `Item_GObj* gobj` argument. Motion2 Anim ignores it and returns false; Motion2 Phys is empty. Motion3 Anim and Motion4 Anim use it to access the item, decrement a positive xDD8 counter, or conditionally call it_80275444 when the counter is nonpositive and flag b5 is clear; both return false. Motion3 Phys obtains item attributes and forwards gobj and two fall-speed fields to it_80272860. Motion3 Coll forwards gobj and callback it_8028D090 to it_8026E414, then returns false. All six subjects have empty baseline fact lists.

### shard-main__melee__it__kinds__itrshell-015
All six assigned parameter subjects have empty baseline fact lists. Their current function definitions take `Item_GObj* gobj`. Motion4 physics reads item fall-speed attributes and passes them with the object to a helper; its collision callback forwards the object and a callback, then returns false. Motion5 animation updates counters, conditionally calls helpers, and returns true when xDD4 is exhausted. Motion5 physics updates horizontal acceleration/velocity and a refresh counter; its collision callback either invokes the state-6 initializer or conditionally reverses horizontal velocity and acceleration, then updates ground rotation. Motion6 animation accesses the item through `gobj->user_data`, updates counters only while xDD4 is positive, and always returns false.

### shard-main__melee__it__kinds__itrshell-016
Reviewed the six assigned parameter subjects; all have empty baseline fact arrays. Their canonical functions each declare an `Item_GObj* gobj` parameter. Motion6_Phys obtains item attributes and forwards the object with two fall-speed attributes to it_80272860; Motion6_Coll forwards it to it_8026E414 with it_8028D090 as callback and returns false. Motion7_Anim ignores its parameter and returns false; Motion7_Phys is empty. Motion7_Coll forwards the object to collision handling and conditionally updates rotation when ground_or_air equals GA_Ground. DmgDealt obtains item user data, calls two helpers with the object, and returns rshell.xDF0. This is bounded subject review, not complete TU coverage.

### shard-main__melee__it__kinds__itrshell-017
The six assigned parameter subjects correspond to callbacks whose canonical first parameter is `Item_GObj* gobj`. The callbacks access that object's item data: Spawned initializes item variables; Thrown and Dropped reset an attribute-derived value and request state changes; EnteredAir sets a flag and requests a state change; DmgReceived delegates processing and returns `xDF0`; HitShield branches on the current state to bounce, delegate processing and return `xDF0`, or return false. All six subjects have empty baseline fact lists, so there are no fact dispositions to issue. This review does not establish compiled register assignments or complete TU coverage.

### shard-main__melee__it__kinds__itrshell-018
The six assigned parameter subjects have no baseline facts. Their current functions each accept `Item_GObj* gobj` and access that object's item data. The bounded bodies implement timed effect spawning, helper-driven horizontal-velocity initialization, state-dependent velocity responses, and decrementing xDEC with xDF0 set when the count reaches zero. The larger decrement response additionally updates velocity and conditionally invokes ground/air-specific helpers. No gameplay meanings are assigned to numeric states or effect IDs.

### shard-main__melee__it__kinds__itrshell-019
The assigned parameters belong to four routines. `it_8028D4E4` conditionally limits horizontal velocity using attribute xC. `it_8028D56C` reads the object's special attributes and returns `(f1 * -x14.x + -x14.y * f2) * x14.z`; one inspected caller supplies attribute x4 and facing_dir and stores the result in horizontal velocity. `it_8028D62C` zeros velocity, reloads xDD8, invokes state setup with argument 0, and installs a jumped_on callback. `it_8028D7F0` forwards its object to state setup with argument 1. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__kinds__itrshell-020
The three assigned parameter subjects have no baseline facts. Their current functions each accept an Item_GObj* named gobj. it_8028DAE4 clears vertical velocity, runs shared initialization, and requests state 5; it_8028E170 runs the same initialization and requests state 6. Both condition hit preservation on the previous state. it_8028E6C0 retrieves item user data, passes gobj to two helpers, invokes Item_8026AE84, and returns the item's xDF0 flag. These observations do not establish a compiled r3 parameter mapping.

### shard-main__melee__it__kinds__itrshell-021
The reviewed callbacks belong to the shell's eight-entry state machine. They include inert animation callbacks, falling physics, collision dispatch, grounded rolling rotation, and state-dependent damage, shield-contact, and jumped-on responses. Hit-response code decrements a counter and exposes its exhaustion through a return flag. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itrshell-022
The reviewed callbacks belong to an eight-entry item-state table. They include no-op animation and physics callbacks, fall-parameter forwarding, field-dependent collision dispatch, and timer-gated calls after thrown/dropped initialization. Helpers decrement an item-variable counter, initialize a zero-velocity state with a jumped-on callback, and select state 5 through a collision callback chain. These local relationships are supported; the external mapping to the Red Shell game concept remains unverified in this bounded shard.

### shard-main__melee__it__kinds__itrshell-023
The reviewed rshell callbacks and helpers implement pickup and thrown-state processing, timed active-state updates, target-position-directed horizontal acceleration and speed limiting, collision reversal and rotation, contact-budget processing, and clank and jumped-on responses. This review covers only the twelve assigned links.

### shard-main__melee__it__kinds__itrshell-024
The reviewed rshell routines initialize stationary and active states, calculate horizontal velocity, steer toward a sampled position, reverse horizontal velocity and acceleration during collision handling, and supply lifecycle/event callbacks. States 0 and 7 have empty physics callbacks. Source literals do not establish compiled .sdata2 membership.

### shard-main__melee__it__kinds__itrshell-025
The reviewed RShell code supplies a callback state table, pickup and airborne transitions, collision-driven active-state initialization, horizontal reversal and grounded rotation, local countdown maintenance, and reflection/damage callbacks. This review addresses only the twelve assigned links; it does not establish compiled section layout or complete translation-unit coverage.

### shard-main__melee__it__kinds__itrshell-026
The reviewed callbacks initialize item-specific fields on spawning, pickup, throwing and dropping; select motion states; delegate falling physics and collision handling; maintain countdowns; and adjust horizontal velocity in response to received damage. States 0 and 2 have empty physics callbacks. The state-6 animation callback invokes the effect helper only when the current state is 5. These behaviors are supported by current source, but the reviewed evidence does not independently establish the gameplay identity required by the assigned Red Shell implementation links.

### shard-main__melee__it__kinds__itrshell-027-repair2
The reviewed links cover shell-specific initialization, state callbacks, horizontal-speed control, finite interaction counters, jumped-on responses, and reflection countdown updates. Current source supports the function and translation-unit relationships; the anonymous compiled `.data` target remains unverified.

### shard-main__melee__it__kinds__itrshell-028
The reviewed code defines eight shell callback sets, initializes thrown, dropped and airborne states, updates shell-specific timers and effects, delegates terrain handling, updates grounded model rotation, and conditionally delegates shield bounce. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itrshell-029
`it_8028D390` decrements the shell-specific `xDEC` counter and sets `xDF0` when the counter reaches exactly zero. Its callers integrate this update into velocity responses; event callbacks return `xDF0` as their result.

Status: researched; no-change lead bypass; independent review and live promotion pending.
