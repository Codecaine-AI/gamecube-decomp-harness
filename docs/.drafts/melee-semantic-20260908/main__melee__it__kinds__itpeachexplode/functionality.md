## Peach explosion item

The module creates and manages `It_Kind_Peach_Explode`. Peach's side-special ending helpers conditionally invoke its constructor with the fighter object, a hip-derived position with Z cleared, the stored move-variant flag, and facing direction (`code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachspecials.c#L334-L369`).

`it_802BD158` builds the spawn request. Failed creation returns NULL without item-specific or debug initialization; successful creation calls `it_802BD248`, then `db_80225DD8`, and returns the item. The existing inferred spawn and post-spawn names fit these canonical roles (`code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itpeachexplode.c#L26-L40`).

Initialization stores the owner, writes `60.0F` to the timer, clears command variable 0, and runs common setup. Importantly, `it_8027518C` subsequently replaces that timer with `it_804D6D28->xF8`; the local literal does not prove an effective 60-frame lifetime. Initialization selects state 1 for a true flag or state 0 otherwise, using `ITEM_ANIM_UPDATE`, then calls the final setup helper (`code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itpeachexplode.c#L47-L64`; `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1429-L1437`).

Both table entries share `itPeachexplode_UnkMotion1_Anim` and have NULL physics and collision callbacks. Despite its symbol, this callback serves both states. It delegates to `it_802751D8`, which decrements the timer and returns true when the result is at most zero. No distinct numeric-state damage or visual properties are established here (`code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itpeachexplode.c#L11-L24`; `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1440-L1449`).

The damage-dealt callback ignores its argument and returns false. The unknown-event wrapper forwards both pointers unchanged to `it_8026B894`; its exact trigger remains unresolved (`code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itpeachexplode.c#L42-L45`; `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itpeachexplode.c#L71-L74`).

Both owned canonical and rendered files were reviewed completely. Rendered helper names were treated as hypotheses rather than independent proof. The header reports a shadowed binding for the spawn name. No compiled section layout is established.

Status: synthesized; independent review and live promotion pending.
