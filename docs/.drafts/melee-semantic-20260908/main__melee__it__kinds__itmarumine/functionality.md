## Electrode item lifecycle

`itmarumine.c` implements Marumine (Electrode), explicitly identified by the common Pokémon registry, with seven motion-state callback sets. The header exports its item-event entry points and state table. Canonical and rendered versions of both owned files were read completely, all 79 subjects and all 73 links were enumerated, and the frozen facts and links were explicitly dispositioned in checkpoints.

Spawn initializes facing, flags, a Pokémon timer to `180 - attr->max`, an effect interval from `attr->xC`, and a sound latch to 1, then enters initial airborne state 0. State 0 delegates appearance processing to shared Pokémon helpers. Its physics predicate is not pure: it applies falling physics and can decrement the appearance timer even when returning false. A successful result causes the local transition to state 1.

State 1 has inert local physics. Its animation callback advances to state 5 when the shared animation predicate fails. Its collision callback enters state 2 only when the collision helper returns false and the animation frame is at least `attr->timer`. State-2 entry freezes animation; its physics delegates falling motion and its collision callback supplies the state-1 entry helper to guarded landing processing. The shared landing path includes additional predicates and exceptional branches, so floor contact alone does not guarantee the transition. The falling helper gates acceleration using sign and speed tests rather than hard-clamping velocity to the configured maximum.

Pickup enters state 3 and installs a periodic accessory effect. Drop and throw both enter state 4, but only throw explicitly installs its accessory. This distinction crosses file boundaries: `Item_80268E5C` clears `on_accessory`, so the dropped path does not inherit the previous accessory merely because it omits an assignment. State-3 and state-4 accessories predecrement the effect interval, emit effect `0x471` at dynamic bone 3 only on exact zero, and reload from `attr->xC`.

State 5 supports air-only falling physics and separate airborne/other collision paths. Its accessory predecrements the primary timer; only after that becomes negative does it decrement the effect interval, set flag x15, and consume the sound latch for sound `0x271F`. The source establishes spawn as a producer of that latch; a script-origin claim is not independently established. Setting x15 is not by itself proof that this accessory activates the explosion attack.

Animation completion in states 3, 4 and 5 converges on state 6. State-4 collision and the state-4 damage event can also request this transition. The external explosion wrapper suppresses requests when x13 is set or state 6 is already active. The terminal helper itself permits either x13 value: when attached, it passes a zero velocity vector through the shared release path, including owner selection and attachment clearing, before hiding the model and selecting state 6. State-6 animation forwards the shared completion result; its local physics and collision callbacks are inert.

## Semantic assessment

The rendered `Run_Coll` hypothesis and Marill explanations are incorrect: this implementation is Electrode, and the registry contains a separate Maril entry. Conservative numeric-state entry/accessory names and the state-2 Fall family remain useful. State-4 Thrown physics is a nonexclusive label because dropped items use the same state. No-op callbacks do not establish global immobility or immunity to external processing. Compiled small-data provenance/layout, overly specific helper interpretations, and unsupported script-origin claims remain explicitly deferred rather than silently retained.

Status: synthesized; independent review and live promotion pending.
