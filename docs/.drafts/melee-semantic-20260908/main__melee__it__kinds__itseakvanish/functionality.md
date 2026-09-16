## Sheik Vanish item

The module defines a one-entry `ItemStateTable`, a nullable article constructor, post-creation initialization, and three item callbacks. The header declares these interfaces and the table.

`it_802B1C60` creates `It_Kind_Seak_Vanish` using the supplied parent, position and direction. Allocation failure returns NULL without either follow-up call. Success calls `it_802B1D40`, then `db_80225DD8`, and returns the item. The fighter-side startup accessory supplies a HipN-derived world position with z cleared and the fighter's facing direction; it ignores the returned pointer. The synchronized visual effect is created separately. See [constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakvanish.c#L19-L33) and [caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialhi.c#L47-L95).

### Important lifetime correction

Initialization assigns the owner, writes `60.0F` to `xD44_lifeTimer`, clears command variable 0, runs four shared helpers, and requests state 0 with `ITEM_ANIM_UPDATE`. However, the fourth helper, `it_8027518C`, **overwrites the timer with `it_804D6D28->xF8`**. It also sets two flags and calls `it_8026BDB4`. Consequently, the visible local literal does not establish a 60-update effective lifetime. The common parameter's runtime value remains unresolved. See [setup order](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakvanish.c#L40-L51) and [shared setup/countdown](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1429-L1450).

The sole table entry installs `itSeakvanish_UnkMotion0_Anim` and has two NULL callback slots. The animation callback returns `it_802751D8` unchanged: that helper decrements the current timer and returns true when the updated value is nonpositive. This is an update-count predicate, not proof of an exact wall-clock duration or damaging-hitbox duration.

`itSeakVanish_Logic42_DmgDealt` ignores its argument and returns false without side effects. `it_802B1DCC` forwards both arguments to reference cleanup and discards its Boolean result. The cleanup clears matching owner, reflector, absorber, fighter, secondary fighter and toucher references; matching the fighter reference also resets source-player metadata to 6. It does not change the timer or motion state. See [callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakvanish.c#L35-L61) and [cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L491-L525).

The debug helper uses fighter-derived collision-display bits for fighter owners, with a separate nonfighter branch using the global item-display setting. See [both branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L210-L225).

### Semantic and rendering assessment

Existing Spawn, Spawned, StateTable and EvtUnk naming hypotheses remain suitable; they are not recovered original names. In particular, Spawned describes the explicit success-path call, not independently proven automatic logic-table dispatch. No equivalent wording-only renames are proposed. Both owned canonical and rendered files were read completely. The header renderer leaves the constructor unchanged because of `shadowed_binding`, although the C definition is substituted. Source-level table structure is established, but compiled section sizes, literal placement and padding are not.

Status: synthesized; independent review and live promotion pending.
