## Event Yoshi Egg

This unit implements the protected event egg through a six-entry `ItemStateTable`, construction, lifecycle adapters, terrain callbacks, interaction rebounds, and damage-triggered breakage. The header agrees with the definitions. All owned canonical and rendered pages were reviewed; neither rendered file reported parsing problems. Rendered names were assessed against canonical behavior rather than treated as evidence.

### State behavior

- **0 — grounded:** entry calls common setup, resets velocity, and selects state 0. Animation returns false and physics is empty. Collision delegates to `it_8026D62C`, which updates position/floor information and invokes state-1 entry on loss of support. Its supported-floor path also conditionally calls `Item_8026ADC0`; remaining grounded is not its only possible downstream action.
- **1 — falling:** entry selects state 1 with `ITEM_ANIM_UPDATE`. Physics passes the configured fall-speed attributes to `it_80272860`. That helper uses a pre-update sign/magnitude gate, not a strict post-update terminal-speed clamp. Landing processing can invoke the grounded initializer, subject to shared collision conditions.
- **2 — held:** pickup selects state 2. Animation returns false, physics is empty, and the collision slot is null. Other lifecycle events, including drop and throw, can change the state.
- **3 — thrown/dropped:** drop delegates to throw, which selects state 3 with numeric flags 6. Physics calls `Item_ApplyFallingPhysics`; terrain contact can invoke the damage-dealt rebound. States 1 and 3 share the constant-false animation callback named `UnkMotion3_Anim`, but have distinct physics and collision callbacks.
- **4 — entered-air:** selected by `EnteredAir`, with inert animation and physics callbacks. Shared terrain processing selects state 1 when unsupported. On supported terrain, entry to state 0 remains conditional on shared flag/counter checks; state 4 can persist.
- **5 — breaking:** animation owns the terminal countdown, physics is empty, and collision returns false.

The source table and state transitions establish these roles without establishing compiled section placement or byte extent. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itevyoshiegg.c#L22-L261`.

### Construction, interactions, and breakage

Construction copies the requested position into both spawn-position fields, initializes the descriptor, and guards all post-allocation work on a non-null result. Successful construction enters state 1 and clears the egg's break flag. The separate Spawned callback clears that flag before entering state 1.

Damage-dealt, clank, shield-hit, and reflected callbacks share a rebound: explicitly set x velocity to 0 and y velocity to 1.5, select state 1, and return false. They do not locally write z. Generic reflection handling separately manages ownership and hitbox-related updates around the reflected callback; the local rebound is not the entire reflection operation.

Damage handling first rejects a nonzero break flag, then rejects `xC9C < attrs->x0`. The literal comparison is preserved rather than normalized into a finite-number-only threshold assertion. The remaining path spawns effect 1231 twice with a local value of 1.5, plays sound 244, hides the model, calls the item helpers, explicitly clears x/y velocity, sets the break flag to 1 and countdown to 60, and enters state 5. It always returns false.

### Timer and cross-file lifetime

State-5 animation checks for counter value 40 **before** decrementing. From an untouched initial value of 60, notification occurs on invocation 21, after 20 prior decrements; invocation 60 decrements 1 to 0 and returns true. More generally, a nonpositive post-decrement count returns true. These are callback counts, not guaranteed elapsed wall-clock frames. The generic animation dispatcher consumes true by requesting item destruction.

Both the countdown notification and Destroyed callback call `gm_801BEB68(1)`. That setter writes event state `x18`; the event routine that spawns the egg later consumes nonzero `x18` on its failure path. The setter itself does not synchronously execute that entire path. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1280-L1290`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmevent.c#L1619-L1662`, and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmevent.c#L2558-L2561`.

`EvtUnk` forwards both objects unchanged to `it_8026B894`; its exact dispatch trigger remains unidentified here. Existing supported names and explanations are retained explicitly in the checkpoint ledger. Proposed changes are limited to one improved state-entry name and five factual clarifications.

Status: synthesized; independent review and live promotion pending.
