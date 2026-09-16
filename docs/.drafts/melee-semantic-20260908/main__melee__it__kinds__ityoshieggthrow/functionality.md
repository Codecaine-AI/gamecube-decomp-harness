## Yoshi Egg Throw article

This module implements creation, fighter attachment, release, flight, explosion, and interaction cleanup for `It_Kind_Yoshi_EggThrow`. The header exposes the article helpers and callbacks. Existing descriptive names generally fit canonical behavior; they are semantic hypotheses, not recovered historical spellings.

### State progression
- **State 0 — held:** pickup selects state 0 with `ITEM_ANIM_UPDATE`. Its table entry has resource index -1 and no callbacks.
- **State 1 — flight:** release selects state 1, whose resource index is 0. Special attribute `x0` initializes the full lifetime and a common-data-scaled secondary lifetime. The animation callback tests the full lifetime before decrementing: an already nonpositive timer starts explosion; otherwise it subtracts one. It always returns false. Physics delegates a sign-sensitive vertical acceleration update, not a post-update speed clamp. Terrain handling updates collision position and dispatches explosion when the combined contact mask has any low-four-bit contact.
- **State 2 — explosion:** resource index 1 supplies only an animation callback. Entry selects state 2 with flags `0x12`, hides the model, invokes common reconfiguration, replaces the temporary common lifetime with special attribute `x4`, queues effects `0x4CE` and `0x4CF` (the latter at scale 1), and requests sound `0x44618`. The terminal callback decrements before testing and returns true when the updated lifetime is nonpositive. The initializer itself has no reentry guard.

These state indices must not be confused with the table's animation-resource indices. See `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ityoshieggthrow.c#L10-L166` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1413-L1450`.

### Fighter/article lifetime
Construction records the supplied position as `SpawnItem.prev_pos`, obtains the spawn position through the fighter-position helper, initializes facing and zero velocity, and requests article creation. Null creation skips attachment. Successful creation attaches to the requested fighter part; Yoshi's caller supplies joint 31 and retains the result.

Release is separate from construction. Its first vector is launch velocity, its second is a position offset, and the misleadingly named `facing_dir` scalar configures spin. The final raw-charge argument is unused. The shared release path scales velocity by the common throw-speed multiplier, conditionally derives facing from horizontal velocity, detaches the model, and handles the alternate-owner branch; the local routine then adds the offset and synchronizes model translation. The fighter clears its retained pointer and damage/death callbacks afterward. Abandonment instead invokes the unguarded item teardown helper, which clears owner and flag `x13` before generic destruction; the fighter-side guard tests the retained pointer and the literal `mv.ys.specials.x0` member.

See `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/ftyoshispecialhi.c#L89-L133`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ityoshieggthrow.c#L31-L94`, and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L770-L1095`.

### Distinct interaction outcomes
Actual logic-table registration establishes `it_802B2C04` as damage-dealt and `it_802B2E7C` as hit-shield. Together with clank, these handlers enter explosion from any state other than 2 and always return false. Shield bounce is different: it mirrors velocity, conditionally updates facing, synchronizes collision facing, and does not change the motion state or lifetime. Reflection negates and scales X/Y velocity, reverses facing, and restores the full timer from the secondary timer without a local state guard. Reference invalidation independently clears every matching stored object reference, resets source-player attribution to 6 when the fighter reference matches, and discards the helper's owner-match result.

See `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_3F2F.c#L905-L922`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/types.h#L26-L71`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L418-L456`, and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L491-L525`.

### Semantic review
Retain supported names and explanations without stylistic rewrites. Correct the unconditional bounded-physics claim and the module-level release-facing claim; identify the previously unspecified hit-shield callback. The header renderer leaves the constructor unchanged with `shadowed_binding`, although the C definition receives its proposed name. Source literals and initializers do not establish compiled section sizes, pooling, padding, or placement.

Status: synthesized; independent review and live promotion pending.
