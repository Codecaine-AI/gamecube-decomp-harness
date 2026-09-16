# Link Bomb semantic review

This unit implements the shared Link and Young Link Bomb item state machine. Its seven callback rows use animation-resource indices `0, 0, 1, 1, 0, 2, 0`; these resource indices must not be confused with motion-state IDs.

## State and event behavior

- **State 0:** picked-up/held behavior. Animation maintains the fuse; physics is empty and the table has no collision callback.
- **State 1:** ordinary falling behavior, with configured falling physics and guarded landing dispatch into state 4.
- **State 2:** **thrown** behavior. The actual item-logic table registers `it_8029E5D0` in the thrown slot. Its existing `Thrown_Anim` interpretation is supported.
- **State 3:** **dropped** behavior. The actual item-logic table registers `it_8029EC34` in the dropped slot. Its animation performs two separate animation checks: the first can restart state 3, and the second can subsequently select state 1. Fuse maintenance always follows. Its physics delegates to falling physics, and collision delegates to state 2's resolver.
- **State 4:** grounded movement and fuse maintenance. Setup records the horizontal-velocity sign and enables direction-relative velocity adjustment. The `MUST_MATCH` condition `(msid != 6) || (msid != 4)` is always true; its alternate velocity-reset branch is unreachable as written. Without that conditional compilation, the main setup path is unconditional. Physics adds the configured signed step and snaps sufficiently small horizontal velocity to zero; actual deceleration depends on attribute values.
- **State 5:** hidden terminal detonation state. Animation delegates to a decrement-before-test lifetime helper; physics and collision are inert.
- **State 6:** EnteredAir handling, distinct from ordinary falling state 1. Entry and restart directly request `ITEM_ANIM_UPDATE`, rather than using the pose-preserving wrapper. Collision immediately selects state 1 if floor support is absent, or conditionally selects state 4 when supported-terrain guards permit it.

The released-state collision resolver snapshots velocity before terrain processing. A result in the low four collision bits enables strict absolute-component threshold tests; excessive horizontal or vertical speed detonates. Otherwise, only the floor bit invokes landing cleanup and state-4 setup. Both released states use `ITEM_DROP_UPDATE`, so that flag alone does not identify a dropped event.

## Fuse, presentation, and object lifetime

The shared fuse update checks expiration before decrementing. Positive lifetime reaching the warning threshold installs article descriptor 3 once and sets `linkbomb.x0.b0`; this is a presentation change, not entry into motion state 3. Before that flag is set, stored increments translate and rotate dynamic bone 3. The transition wrapper preserves that bone's Y translation and X rotation and ORs either command-update or animation-update flags into the caller's mask.

Construction is nullable. The supplied thumb position initializes `SpawnItem.prev_pos`, while `SpawnItem.pos` is derived separately from the fighter. Successful construction initializes lifetime, warning and damage-response flags, an originating-fighter reference, and scale-dependent model increments. The denominator `lifetime - warning_threshold` is not guarded locally.

The external explosion wrapper rejects x13-set items and state 5. Internal detonation setup has no equivalent entry guard: x13 controls only auxiliary handling. Its owner-specific fighter call requires a non-null current owner equal to the saved originating fighter. Reference cleanup clears that saved pointer only on equality, then always invokes generic interaction-reference cleanup.

Damage-received handling prioritizes the accumulated-damage threshold over the one-shot relaunch flag. Its horizontal branch compares signed `vel.x`, not absolute speed, and its vertical assignment is multiplied by facing direction. Reflection delegates to shared code that reverses/scales planar velocity, reverses facing, and restores the remaining timer from the half-life timer; it does not reset the bomb-specific warning flag in that helper. HitShield and ShieldBounced remain distinct delegated responses.

## Supported corrections and retained knowledge

Most existing names and explanations remain supported and are explicitly retained in the checkpoint ledger. Corrections address the reversed dropped/thrown setup names and state-3 physics interpretation, the constructor's two position sources, and the claim that `0x78` is an effect ID. In `lb_800119DC`, that argument is stored in `unk_count0`; the actual `efSync_Spawn(0x40E, ...)` call occurs in `it_80272A60`.

Both canonical and rendered owned files were read completely, together with every frozen subject and link page. Rendered names were treated as hypotheses. The header renderer reports `shadowed_binding` for `it_8029DD58`, leaving that declaration unrenamed even though the C definition is rendered as `itLinkBomb_Spawn`. No compiled section-size, placement, or exhaustive layout conclusions are established by this review.

Status: researched; no-change lead bypass; independent review and live promotion pending.
