## Star world-item behavior

This unit implements the normal Star/Super Star (Starman) item, not the Hitodeman/Staryu Poké Ball summon. The normal-item registry binds the Star table, spawn, damage-dealt and event callbacks together ([registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_3F14.c#L242-L259)).

- **Spawn:** calls shared initialization, stores a randomly selected ±1 horizontal travel sign, loads signed x and configured y launch velocities, clears z velocity, then requests numeric state 0 with `ITEM_ANIM_UPDATE`.
- **State table:** one source-level entry associates the state with animation, physics and collision callbacks. The rendered `itStar_UnkMotion0` wrapper name fits its fixed state request and sibling callback names; it is not proof of historical spelling.
- **Animation:** ignores its argument and returns false without side effects.
- **Physics:** delegates the two fall attributes to `it_80272860`. That helper conditionally subtracts acceleration using a sign-dependent speed threshold; it does not clamp velocity exactly to the threshold and can overshoot it ([helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L176-L204)).
- **Collision:** performs three independent, ordered checks. The first reloads x/y launch velocity and requests state 0 using `ITEM_UNK_0x1 | ITEM_HIT_PRESERVE`; the second negates the persistent travel sign and current x velocity; the third clears y velocity only when positive. Multiple responses can occur during one invocation. Any successful check gates one call to `Item_8026AE84(item, 0xFA, 0x7F, 0x40)`, including upper contact with already nonpositive y velocity. The callback always returns false. Collision does not reset z velocity or directly write `facing_dir`.
- **Interaction and lifetime:** damage-dealt returns true without directly removing the item or applying fighter invincibility. The event adapter forwards both object pointers unchanged to `it_8026B894`; downstream reference handling belongs to that shared routine. False animation/collision results do not establish immunity to removal elsewhere.

These behaviors are visible in the [complete implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itstar.c#L14-L90). The [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itstar.h#L11-L18) agrees with the definitions. Both rendered files were reviewed without parser or substitution defects. External rendered helper names were treated as hypotheses rather than independent evidence.

## Semantic disposition

Retain the supported callback descriptions and convention-based names. Correct five facts that mistakenly identify Star as Staryu, reject three corresponding concept links, and narrow the table type description to source-supported properties. Four `.sdata2` facts remain unresolved because C literals do not prove compiled section contents, extent or padding.

Status: synthesized; independent review and live promotion pending.
