## Kirby copied Egg Lay

This translation unit implements Kirby's copied-Yoshi neutral-special setup, capture callbacks, hat animation, item and victim processing, ground/air transitions, attribute accessors, and retained-item cleanup.

### Entry and capture
The grounded entry selects `ftKb_MS_YsSpecialN1`; the aerial entry selects `ftKb_MS_YsSpecialAirNCapture2`. Both clear command slot 0, initialize fighter and hat animation, install future grab callbacks, and restore Kirby's death/damage callbacks. The aerial entry does not require an already-captured opponent. Item-backed grab callbacks initialize `target_item_gobj`; their paired fighter-grab callbacks do not.

### Scripted processing and lifetimes
Intermediate animation callbacks require command slot 0 and the appropriate nonnull item or victim before consuming commands and changing phase. Item-processing callbacks in grounded `NCapture2_0` and aerial `N2_1` independently handle cleanup and creation: cleanup requires command slot 1 and a nonnull target, whereas item creation requires command slot 0 alone. Creation builds position, velocity, facing, lifetime and damage-related parameters before calling the Egg Lay item constructor.

Grounded `NCapture2_1` and aerial `N2_0` process fighter victims. Each command remains pending if its required victim is absent. The actual victim confinement, model enclosure, growth, mash feedback, damage-driven timer reduction and release occur in `ftkirbyyoshiegg.c`, which independently confirms the accessor roles. Its damage callback also has a separate condition forcing immediate timer expiration.

The terminal cleanup wrapper does nothing without a retained item. Four exact motion IDs select a Boolean passed to item teardown; the independent callee shows that this Boolean controls only resetting `destroy_type`, not whether destruction occurs. Fighter-side references are then cleared.

### Terrain, movement and naming
Collision wrappers delegate their guards to shared collision helpers and register explicit transition callbacks. Transitions preserve phase progress and restore lifecycle callbacks. Physics wrappers select common grounded or airborne movement; notably, the airborne-spelled `AirNCapture1` physics/collision pair uses grounded helpers. Numeric suffixes and canonical or rendered names therefore cannot establish a uniform ground/air or item/victim mapping.

The rendered source was reviewed alongside all canonical lines. Most existing names and explanations remain useful and are explicitly retained in the checkpoint ledger. `GetEggAccessoryJoint` is supported by the independent consumer's `HSD_Joint*` cast despite the accessor's declared `ftDynamics*` return. The proposed aerial item-grab name makes a useful distinction from its paired fighter-grab callback. No compiled section size, ordering or constant-pool provenance is asserted from source literals.

Status: synthesized; independent review and live promotion pending.
