## Freezie state machine

The unit implements a six-entry Freezie motion-state table. Motion-state indices are not animation IDs: states 0, 1, 4 and 5 use animation ID 0, state 2 uses -1, and state 3 uses 1. States 1 and 3 share the same inert animation callback.

- **0 — autonomous sliding:** grounded physics integrates the stored signed speed using terrain contribution and article attributes, clamps it, reconciles facing, and projects it into horizontal velocity. Collision processing refreshes terrain information, reverses movement on the tested side-contact masks, and adjusts model rotation. Loss of support invokes the state-1 selector.
- **1 — falling:** applies configured fall physics and transitions to state 0 on floor contact, caching the floor normal for subsequent sliding. Spawn, drop and support-loss paths can enter this state.
- **2 — held:** pickup clears an optional reciprocal association before selecting this animation-only entry, whose physics and collision slots are null.
- **3 — thrown:** applies fall physics and returns the Boolean interpretation of the shared environment-collision result. Its collision callback does not itself implement fighter freezing.
- **4 — linked deceleration:** initialization resets velocity, stores a nonnegative braking magnitude and an associated object, grounds the item, and selects state 4. Physics consumes a pending horizontal velocity only when nonzero, clears that pending value, and then brakes toward zero. Collision processing can enter falling, detach the association, enter recovery on obstruction, or return to sliding when grounded without a link. Obstruction handling precedes the missing-link fallback.
- **5 — stopped recovery:** entry resets velocity and initializes a counter to 90. Animation and physics callbacks are inert. Collision processing runs the shared support check before testing the counter. Positive values are decremented; an already nonpositive value restores stored horizontal speed and selects state 0. Therefore this is not an unconditional exact 90-frame residence. The shared collision call can select state 1, and the subsequent expired-counter branch can overwrite that selection with state 0.

## Construction and cross-file lifetimes

The specialized constructor creates `It_Kind_Freeze`, performs normal initialization, and then enters linked state 4. Its demonstrated Old Ottosea caller passes a non-null actor, retains the returned Freezie, and subsequently coordinates its pending velocity through proximity-dependent updates. The constructor's null-reference branch is not demonstrably safe: local `ip` is assigned only when `ref_gobj` is non-null and is subsequently tested regardless.

The associated actor and Freezie retain reciprocal references. Destruction, pickup and relevant state-4 collision paths call `it_802E37A4` before clearing the Freezie-side reference. That helper clears the peer's x20 field; it does not destroy the peer. Conversely, actor-side cleanup calls `it_8028ECE0`, which only clears the Freezie-side backlink. Generic reference invalidation through `it_8026B894` is separate and does not clear `freeze.unk_1C`.

The velocity/lifetime setter always writes its float argument and refreshes both lifetime timers. A zero argument cancels a pending override rather than directly stopping current horizontal velocity. The half-life timer uses the configured multiplier, not an assumed literal one-half.

## Interaction and generic tail helpers

Damage-dealt, damage-received, clank, shield-hit and absorption callbacks return true without local processing. Reflection and shield bounce delegate to shared handlers; the former reverses/scales planar velocity, reverses facing and refreshes the life timer. Callback existence alone does not establish ordinary absorption eligibility.

The final three helpers also serve Heiho-carried food, despite residing in this file. They prepare a carried item by resetting velocity and clearing flags, reactivate and resynchronize it before release, or delegate its destruction when the carrier exits the boundary margins. Existing explanations recognizing this generic food lifetime are retained; two stale Freezie-specific links are rejected, and the misleading rendered `itFreeze_Logic17_Destroy` name is replaced by a carried-item description.

## Rendered-name assessment

Most existing semantic names fit canonical behavior and are retained without cosmetic rewrites. `Linked` and `Pushed` describe compatible aspects of state 4. The header renderer reports `shadowed_binding` for `it_8028EB88` and `it_8028ECF0`, leaving those declarations unchanged while their implementation definitions are substituted. No compiled section composition or layout is inferred from the rendered view or source literals.

Status: synthesized; independent review and live promotion pending.
