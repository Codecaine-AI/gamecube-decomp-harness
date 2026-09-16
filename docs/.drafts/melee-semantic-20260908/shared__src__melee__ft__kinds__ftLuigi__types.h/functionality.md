## Luigi shared type declarations

`src/melee/ft/kinds/ftLuigi/types.h` declares fighter variables, special-move attributes, and move-specific motion variables; it contains no executable behavior.

- `ftLuigi_FighterVars` declares a Boolean `x222C_cycloneCharge`, two unnamed-purpose `u32` fields, and a padding array expressed using `FIGHTERVARS_SIZE`. The declaration does not establish initialization or reset lifetimes. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/types.h#L8-L13)
- `ftLuigiAttributes` groups parameters under Green Missile, Super Jump Punch, and Luigi Cyclone. Most fields are floats; Cyclone's `x88_LUIGI_CYCLONE_UNK` and `x94_LUIGI_CYCLONE_LANDING_LAG` are signed integers. Several names and comments remain explicitly uncertain; the header alone does not verify their runtime formulas. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/types.h#L15-L63)
- `ftLuigiSpecialS` declares signed charge frames and a Boolean misfire flag. `ftLuigiSpecialLw` declares ground horizontal velocity, two signed integer fields, and a Boolean collision-related field. The latter's comments do not prove that a field is unused or establish the precise collision calculation. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/types.h#L65-L81)
- `ftLuigi_MotionVars` is a union of side-special and down-special state, not two independent simultaneous state records. Its declaration does not identify active-member transitions. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/types.h#L83-L86)

## Review outcome

Inherited research read all 89 canonical and rendered lines and enumerated the empty subject and link inventories. The rendered view reports zero substitutions and zero parse errors; it introduces no alternate names to assess. There are no baseline facts or links to retain or correct. Independent lead reconciliation of the hash-bound handoff, functionality document, and proposal found no proposed facts or upstream contradictions requiring targeted source verification. No supported semantic correction warrants a proposal. Offset comments are treated as source annotations, not independently verified compiled layout.

Status: synthesized; independent review and live promotion pending.
