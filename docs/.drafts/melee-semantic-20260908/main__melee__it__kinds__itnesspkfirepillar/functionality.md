## Ness PK Fire flame pillar

The unit implements the persistent `It_Kind_Ness_PKFire_Flame` article. Its header agrees with the definitions and exposes seven functions and a one-entry state table. Both owned files were read completely in canonical and rendered form. The rendered `Spawn` and `Setup` hypotheses fit the canonical bodies and are retained; rendered helper names were not treated as independent proof.

### Construction and lifetime
The traveling projectile's damage-dealt and clank callbacks pass the projectile, owner, vertically adjusted position and facing direction to the pillar factory, then return true. The factory flattens the spawn position to z=0, zeros velocity and initial damage, and preserves the distinct parent-pointer assignments. Allocation failure skips both post-spawn calls. Successful allocation invokes the debug helper and pillar setup. Setup selects numeric state 0 with `ITEM_ANIM_UPDATE` and passes special attribute `x0` to the common lifetime initializer, which writes both primary and scaled half-life timers.

### Runtime state
The sole table entry registers animation, physics and collision callbacks. Animation computes `(attrs->scale + life * (1 - attrs->scale) / attrs->x0) * common_scale`, applies it uniformly to the root model, and only then tests lifetime. A nonpositive entry-time timer returns true; otherwise the timer is decremented and the callback returns false. There is no interpolation clamp or zero-denominator guard. In particular, a negative timer need not produce exactly the configured terminal scale.

Physics and collision contain documented assignment-in-condition bugs: both assign `GA_Air` rather than compare the current situation. The physics path supplies common fall parameters to its helper. Collision selects `it_8026E414` with `it_80273454`; the nominal grounded branch remains visible in source. The terrain helper updates collision position and floor bookkeeping and dispatches the supplied response for floor contact. The response delegates to velocity reset. The pillar collision callback always returns false.

### Damage and event handling
Damage changes lifetime to the previous lifetime minus `item->xC9C * attrs->x4`. Only a nonpositive result is replaced with 1.0F; positive fractional values are not raised to 1. The callback returns false, leaving expiry to animation. Starting from 1, animation first decrements to zero and reports expiry on a later invocation, absent intervening mutation. The unknown-event wrapper forwards both object arguments unchanged to `it_8026B894`; its exact trigger is not established locally.

### Review outcome
Retained 45 existing facts and all 17 links, marked four compiled-section claims unresolved, and proposed one factual correction to the animation state explanation. No cosmetic renaming, relationship merging or source edits are proposed. Source declarations and literal uses do not prove compiled section extents, placement or constant-pool contents.

Status: synthesized; independent review and live promotion pending.
