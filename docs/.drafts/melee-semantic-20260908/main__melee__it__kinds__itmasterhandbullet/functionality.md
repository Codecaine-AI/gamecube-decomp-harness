## Master Hand Bullet

This module constructs and updates the bullet item created by Master Hand's FingerGun code. The constructor copies both supplied positions, sets horizontal velocity to `vel_x * facing_dir`, preserves vertical velocity, clears Z velocity and initial damage, and supplies the parent in both spawn-parent fields. It immediately initializes the returned object without a local allocation-failure check. A zero selector chooses state 0; every nonzero selector chooses state 1. The observed caller supplies a Boolean derived from `ftLib_80087120(gobj) > da->xEC`.

Both initializers install the same empty accessory callback, copy special-attribute `x0` into the item-specific lifetime counter, perform common setup, and set the model rotation's Y component to π/2 times facing direction. The two state-table entries share animation, physics, and collision callbacks; their numeric distinction does not establish a particular damage threshold or visual variant.

The animation callback emits effect `0x405` at the current position before subtracting `1.0f` from the counter. It returns true only when the updated value is strictly negative; exactly zero returns false. This is a floating-point counter measured in callback invocations, not an unconditional wall-clock timer. Local physics and accessory callbacks are empty, which does not imply that generic engine movement is absent.

Collision delegates to `it_8026E15C` and always returns false. The common helper refreshes collision data, updates position and qualifying floor information, and invokes the supplied empty event only through nested contact/helper guards. Neither the empty event nor the wrapper requests a local state transition.

Damage-dealt, clanked, absorbed, and shield-hit callbacks return true without local side effects. Generic item dispatch directly corroborates destruction on a true damage-dealt result. Reflection and shield bounce forward the item and return the shared helper's result unchanged.

The reference-removal callback delegates matching relationship cleanup and discards the helper's Boolean result. Cleanup itself does not destroy the projectile, but the surrounding removal loop can subsequently destroy flagged items using the owner cached before callback invocation. Local cleanup therefore does not guarantee survival across the full removal operation.

## Semantic assessment

The rendered constructor, state-1 initializer, reference-removal, and ground-event names fit canonical behavior and are retained as semantic names, not recovered historical spellings. Both owned files rendered without parse errors; substitution covers function names only. The animation-purpose explanation needs one substantive correction: its behavior is shared by states 0 and 1, not established as state-1-specific by its historical symbol.

The completed ledger explicitly covers 98 facts: 85 retained, 12 unresolved, and one superseded. All 35 links are explicitly retained without merging historical duplicate relationships. Compiled sizes, constant-section contents, and initializer-template placement remain unresolved because source literals and local aggregates do not prove emitted layout.

Status: synthesized; independent review and live promotion pending.
