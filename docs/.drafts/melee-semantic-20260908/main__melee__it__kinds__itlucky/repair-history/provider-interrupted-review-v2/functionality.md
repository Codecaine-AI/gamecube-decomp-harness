# Disjoint Librarian Research

### shard-main__melee__it__kinds__itlucky-000
Reviewed the assigned canonical and rendered `itlucky.c` lines 1–450. The file defines two callback tables and associated state logic. The first initializes a randomized repetition count and advances a phase field through 2, repeated 3, and 4; an accessory callback consumes a command flag to attempt a spawn. Spawn position comes from bone slot 32, horizontal velocity is randomized, and a cached condition gates selection between two spawn routines. The local spawn routine constructs an `It_Kind_Lucky_Egg` descriptor with owner and immediate-parent references. Other callbacks delegate collision handling, pass fall-speed attributes to a shared physics helper, and enter state 6 when a field reaches an attribute threshold. The second callback family implements state entry, velocity reset, and a shared lifetime decrement that returns true at expiration; its state-2 callbacks do not decrement that timer. This summary covers only the assigned source range, not complete TU or external-helper verification.

### shard-main__melee__it__kinds__itlucky-001
Reviewed only the assigned canonical and rendered `itlucky.h` lines 1–56. This guarded header declares an item-facing interface: functions accepting `Item_GObj*` or `HSD_GObj*`, boolean-returning and void-returning motion callbacks, named Logic44 lifecycle callbacks, a function returning `Item_GObj*` with object, position, velocity, and facing parameters, and two externally defined `ItemStateTable` arrays. It contains no function bodies or table initializers, so actual state transitions, spawning behavior, gameplay identity, and callback registration are not established by this shard.

### shard-main__melee__it__kinds__itlucky-002
The reviewed subjects describe two state-callback arrays, floating-point launch and lifetime calculations, three single-call lifecycle adapters selecting states 2, 3, and 4, and an interaction-reference cleanup adapter. The local source distinguishes an actor phase sequence from a constructed It_Kind_Lucky_Egg and its timed callback family. Gameplay identity, dispatcher ownership, and compiled section layout remain explicitly deferred where not independently established.

### shard-main__melee__it__kinds__itlucky-003
The six assigned callbacks initialize the Lucky Egg state sequence, provide inert state-2 updates, and share lifetime, falling-velocity, and landing processing between state slots 1 and 3. The physics callback belongs to the egg-side table, not the separate parent-item table. External Chansey, Softboiled, and healing mappings were not independently established. This is a bounded subject review, not complete TU coverage.

### shard-main__melee__it__kinds__itlucky-004
The six assigned functions initialize the Lucky actor and implement its state-1/5 and state-6 callbacks. States 1 and 5 share an inert animation callback, attribute-driven vertical-velocity update, and terrain handling that can restore the phase-selected state. State 6 has another inert animation callback and the same physics operation, but no collision callback. Initialization sets phase 2, a randomized phase counter, auxiliary data, and command flags before entering state 0. The canonical registry explicitly identifies this actor as Lucky (Chansey). This review does not establish complete TU coverage.

### shard-main__melee__it__kinds__itlucky-005
The six assigned functions implement phase-state entry, collision-triggered resumption, animation-completion phase progression, and command-triggered egg emission. The phase controller advances 2→3, decrements a cycle counter while in phase 3, enters 4 at zero, and then returns the terminal animation-callback result. State entry clears the command latch and restores effect-hitlag and accessory callbacks. Emission computes launch parameters, attempts one of two constructors, and performs a success-only follow-up; the accessory consumes its command regardless of spawn success. This review covers the assigned subjects and supporting code, not the complete TU.

### shard-main__melee__it__kinds__itlucky-006
Reviewed the six assigned functions and their baseline facts. The actor table shares an empty physics callback and a floor-collision wrapper across states 2–4. The wrapper supplies the state-5 entry helper as its lost-support event. Separate entry helpers initialize states 1, 5, and 0; state 0 delegates animation updates to shared model-scale progression. Current source explicitly associates this actor table with Lucky (Chansey), but does not establish the move name Softboiled.

### shard-main__melee__it__kinds__itlucky-007-repair2
The assigned functions cover initial-state movement and collision adapters, a threshold-controlled transition to state 6, interaction-reference cleanup, construction of It_Kind_Lucky_Egg, and that item's velocity-resetting transition to state 0. The factory preserves owner/emitter relationships and forwards construction failure. Gameplay labels and several callback-role/name claims remain less firmly established than these source-level operations. This review is limited to the assigned subjects.

### shard-main__melee__it__kinds__itlucky-008-repair2
Reviewed the six assigned callback subjects and their 35 baseline facts. The local lifetime predicate decrements xD44_lifeTimer and tests for expiration; states 0, 1, 3, and 4 use it directly or through wrappers. States 0 and 4 have empty physics callbacks. State 0 delegates collision processing to a helper that invokes the state-1 entry routine when its floor test fails. Spawn initialization also enters state 1. The entered-air hook selects state 4, whose animation callback forwards the lifetime predicate. This review does not establish external Chansey/Softboiled mappings or complete translation-unit coverage.

### shard-main__melee__it__kinds__itlucky-009
The reviewed actor code initializes a randomized phase counter, advances phase-indexed motion states, and emits objects from a bone-derived position when an accessory command is set. The separate five-entry egg table includes lifetime-counting callbacks and pickup, drop, and entered-air transitions. `it_802D5A68` is entry 4's collision callback: it delegates to `it_8026E8C4` with transitions to states 0 and 1 and always returns false. Gameplay identity and move-name claims remain deferred rather than inferred from internal names.

### shard-main__melee__it__kinds__itlucky-010
The six assigned parameter subjects have no baseline facts. Their current functions declare an Item_GObj* argument: Spawned accesses item attributes and forwards the object to initialization helpers; PickedUp forwards it to Item_80268E5C with state argument 2; UnkMotion3_Anim forwards it to a timer-decrement callback; UnkMotion3_Coll passes it to it_8026E15C with it_802D582C and returns false. UnkMotion2_Anim ignores its argument and returns false, while UnkMotion2_Phys is empty. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itlucky-011
Reviewed the current bodies associated with the six assigned parameter subjects. All declare an Item_GObj* parameter named gobj. The motion-3, motion-5, and motion-6 physics callbacks obtain item attributes through that object and pass the object plus fall-speed attributes to it_80272860. The motion-5 collision callback forwards the object to it_8026E15C with it_802D50F0 as callback, then returns false. The motion-5 and motion-6 animation callbacks do not use their parameter and return false. The bundle contains no baseline facts for these subjects; no fact dispositions or new proposals are submitted.

### shard-main__melee__it__kinds__itlucky-012
The six assigned parameter subjects have no baseline facts. Their current functions take a `gobj` argument: five declare `Item_GObj*`, while it_802D51C8 declares `HSD_GObj*`. The argument supplies item state for initialization, phase/count progression, conditional accessory handling, and callback setup; it_802D50F0 forwards it to two helpers. it_802D51C8 derives position and randomized velocity from the item's attributes and bone table, then passes the same object to one of two creation helpers. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itlucky-013
Reviewed the six assigned parameter subjects; all have empty baseline fact lists. Their current functions take one object pointer: it_802D53AC conditionally forwards it to it_802D5124; it_802D53F0 is empty; it_802D53F4 forwards it to a collision helper with it_802D546C as callback; it_802D5420 passes it through a state-setting call and three additional helpers; it_802D546C uses it to select state 5, clear xDAC_itcmd_var0, and install effect pause/resume callbacks; it_802D5560 forwards it through three initialization calls. Source-level pointer declarations do not independently establish the parameter identities' compiled r3 mapping.

### shard-main__melee__it__kinds__itlucky-014
The assigned subjects have no baseline facts to disposition. Their current function bodies declare Item_GObj* parameters: it_802D55DC and it_802D5600 forward their object to individual helpers; it_802D5620 forwards its object with callback it_802D5420 and returns the helper result. it_802D5648 compares item field xC9C against special attribute xC, conditionally invokes a helper and local initialization sequence, and always returns false. it_802D56F0 forwards both object arguments unchanged to it_8026B894. This review is limited to the assigned parameter subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itlucky-015
The assigned subjects have no baseline facts. Canonical source shows that it_802D5710 accepts an item object, position and velocity pointers, and a floating-point facing value; it returns NULL for a NULL object, otherwise builds a spawn request using those inputs and the object's owner. it_802D582C obtains item data, calls it_8026B390 and itResetVelocity, and requests state 0 with ITEM_ANIM_UPDATE. it_802D5884 decrements the item's life timer by 1 and returns whether it is nonpositive. Register-labelled parameter identities are not equated with source parameters without compiled ABI evidence.

### shard-main__melee__it__kinds__itlucky-016
The six assigned parameter subjects have no baseline facts. Their current function bodies use a single object argument: it_802D58BC and it_802D5A64 leave it unused; it_802D58C0 forwards it to it_8026D62C with it_802D58EC as callback; it_802D58EC forwards it to Item_80268E5C with state argument 1 and ITEM_ANIM_UPDATE; it_802D5A2C delegates to the lifetime-decrement check it_802D5884; and it_802D5A68 forwards it to it_8026E8C4 with two callbacks, then returns false. This review is limited to the assigned subjects.

### shard-main__melee__it__kinds__itlucky-017
The reviewed code constructs an It_Kind_Lucky_Egg object through a command-gated emission branch. Its local callback family includes lifetime countdown, state transitions, passive pickup-state physics, and collision-helper dispatch. Two reference-event wrappers forward both arguments unchanged. Exact gameplay identities and several shared-helper semantics remain unverified.

### shard-main__melee__it__kinds__itlucky-018-repair2
The reviewed callbacks delegate collision processing with local state-transition callbacks. The parent state machine installs a command-triggered spawn accessory and advances a repeat counter. A secondary state family includes velocity reset, gravity, lifetime expiration, pickup and drop transitions. These implementation relationships are visible, but the gameplay identities and exact shared-helper contact conditions remain unverified.

### shard-main__melee__it__kinds__itlucky-019
The reviewed callbacks implement phase progression, command-triggered spawning, and a separate item lifecycle with lifetime decrement, collision-driven transitions, pickup/drop/entered-air states, and passive physics slots. The constructor explicitly requests It_Kind_Lucky_Egg. External gameplay identities and shared-helper semantics require additional evidence beyond local names and adjacency.

### shard-main__melee__it__kinds__itlucky-020
The reviewed callbacks initialize and advance a phase-selected actor state machine, install an animation-command-driven spawn accessory, and delegate collision transitions to shared item helpers. A second callback table includes lifetime updates, falling physics, and pickup/drop states. The falling helper directly updates vertical velocity. External Chansey and Softboiled identity claims remain unverified.

### shard-main__melee__it__kinds__itlucky-021
The reviewed code advances a repeat-counted phase sequence and installs a command-triggered accessory callback that constructs items. A separate callback table provides lifetime countdown, state transitions, and collision delegation associated with the local Lucky Egg constructor. Source behavior supports these mechanisms, but does not independently establish the named gameplay concepts or external item-kind dispatch.

### shard-main__melee__it__kinds__itlucky-022
The reviewed implementation advances a counter-controlled phase sequence and invokes one of two constructors when an accessory command flag is set. Its local constructor explicitly requests It_Kind_Lucky_Egg. A second state table includes lifetime-countdown callbacks, a no-op animation callback selected by pickup, and transitions between stationary and gravity-updated states. The exact Chansey/Softboiled gameplay mapping is not established by these bodies.

### shard-main__melee__it__kinds__itlucky-023
The reviewed accessory callback consumes a command flag and invokes a randomized item-emission helper. One branch explicitly constructs It_Kind_Lucky_Egg with supplied position, velocity, facing and parent references. The second local state table contains a no-op animation callback for state 2, a collision callback for state 0, and a state-4 animation callback that decrements the lifetime through a shared helper. These mechanics do not independently establish the named Softboiled gameplay mapping.

Status: researched; no-change lead bypass; independent review and live promotion pending.
