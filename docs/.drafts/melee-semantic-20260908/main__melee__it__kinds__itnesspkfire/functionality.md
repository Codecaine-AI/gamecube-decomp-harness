## Ness PK Fire traveling projectile

The module constructs `It_Kind_Ness_PKFire` and supplies its single source-defined state-table entry. Inherited research establishes complete canonical/rendered coverage and agreement of header declarations with implementation. The lead independently reconciled the proposal and functionality artifacts with the canonical implementation and pillar constructor. Retain the supported Spawn, Init, Clanked, and EvtUnk name hypotheses; rendered substitutions do not establish original symbol spellings.

### Construction and lifetime
`it_802AA054` copies the supplied launch position into `SpawnItem.prev_pos`, forces that vector's Z component to zero, and obtains `SpawnItem.pos` separately through `it_8026BB68`. It copies velocity and facing, assigns both parent fields, and requests allocation. Only a non-null result receives debug setup, initialization, and the supplied model Z rotation. The void routine exposes neither the created object nor allocation status. Ness's fighter-side callback selects grounded or aerial launch attributes before calling it.

`it_802AA1D8` selects numeric state 0 with `ITEM_ANIM_UPDATE` and passes special-attribute `x0` to `it_80275158`. That helper initializes `xD44_lifeTimer` and sets `xD48_halfLifeTimer` to lifetime multiplied by a common attribute; the field name does not establish a literal one-half factor. The animation callback decrements first and then returns whether the updated lifetime is <= 0. The table has no state-specific physics callback. Sources: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkfire.c#L20-L70 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1414-L1421.

### Terrain and combat responses
The collision callback returns `it_8026E058` unchanged. The helper updates collision-derived position, conditionally records the floor index, combines collision tests, and tests mask `0xD`; no additional meaning is assigned to individual bits here.

Damage-dealt and clank callbacks copy the projectile position, add special-attribute `x4` to Y, and call the separate pillar constructor with the projectile, its current owner, adjusted position, and facing. Both return true regardless of whether the pillar allocation succeeds. The pillar constructor initializes a separate `It_Kind_Ness_PKFire_Flame` with zero initial velocity; it does not transform the original object in place. The supplied attribute value does not prove that the offset is positive or small. Sources: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkfire.c#L77-L97 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkfirepillar.c#L34-L65.

Absorption and ordinary shield contact return true without local mutation or pillar creation. Reflection delegates to a helper that reverses and scales planar velocity by `xC70`, reverses facing, copies the stored half-life timer into the active timer, and returns false. Shield bounce first negates model Z rotation, then delegates velocity mirroring and facing adjustment to the shared shield-bounce helper, which returns false. Helper sources: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L418-L428 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L430-L456.

### Reference lifetime
`it_802AA474` forwards both event arguments to `it_8026B894` and discards its Boolean result. Independent comparisons clear all matching owner, reflector, absorber, source-fighter, secondary-fighter, and toucher references; clearing the source-fighter reference also resets the source-player field to 6. The outer dispatcher preserves the pre-cleanup owner for a separate conditional destruction decision, so the wrapper's lack of a destruction operation does not imply that the overall event always preserves the item. Source: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L474-L525.

### Review outcome
Retain the supported existing names and behavioral knowledge. Adopt three explanation corrections concerning allocation success and offset direction/magnitude. Seven compiled-section claims remain unresolved rather than rejected: source-level declarations and literal usage do not establish emitted section sizes, addresses, padding, or string placement.

Status: synthesized; independent review and live promotion pending.
