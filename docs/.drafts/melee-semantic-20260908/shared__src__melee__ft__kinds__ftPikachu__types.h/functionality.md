## Pikachu shared type declarations

This header declares fighter-specific storage, special-move attributes, and motion-state variables; it contains no executable behavior.

- `ftPikachu_FighterVars` contains only a `char` filler array sized by `FIGHTERVARS_SIZE`. This declaration does not establish whether consumers use that storage. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/types.h#L12-L14)
- `ftPikachuAttributes` includes named ground/air neutral-special spawn offsets and item kinds, aerial landing lag, and side-special startup friction and gravity. Many other attributes retain offset-based names. Existing comments identify several up-special parameters, including zip duration, angle offsets, minimum stick magnitude, velocity slope/intercept, second-zip velocity decay, and minimum angle difference between zips. These comments are not independent verification of runtime formulas or units; notably, the angle-difference field `xA8` is declared `s32`. The structure ends with `ftCollisionBox height_attributes`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/types.h#L16-L74)
- `ftPikachu_MotionVars` is a union with two explicitly unnamed state variants, an up-special variant containing integer, vector, and floating-point members, and a down-special variant containing an `Item_GObj*` and a boolean. These declarations do not establish state transitions, numeric-state meanings, exceptional paths, or item-pointer ownership and lifetime. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/types.h#L76-L102)

## Semantic assessment

All 105 canonical and rendered lines were reviewed. The renderer reported zero substitutions and zero parse errors; its function-name-only coverage supplies no additional validation of field names. The existing descriptive names and comments present no demonstrable contradiction within this declaration-only scope. Offset-based names and explicit state-name TODOs remain uncertain rather than receiving speculative replacements. No compiled layout or section conclusions are drawn.

The complete subject and link enumerations are empty, leaving no baseline facts or links to retain or correct. No supported semantic change is proposed.

Status: synthesized; independent review and live promotion pending.
