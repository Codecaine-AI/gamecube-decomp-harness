### Ice Climbers shared type declarations

`src/melee/ft/kinds/ftPopo/types.h` declares three data containers, not executable behavior:

- `ftPopo_FighterVars` contains two `Item_GObj*` fields, a one-bit flag, explicit filler, integer fields, a vector, and a float. The declaration alone does not identify the referenced items or establish ownership and cleanup lifetimes. [Canonical declaration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/types.h#L8-L18)
- `ftIceClimberAttributes` contains predominantly floats, two integer fields, and explicit byte arrays. Four fields have gravity or terminal-velocity names; the others largely retain offset-based names. The source includes `ASSERT_SIZE(ftIceClimberAttributes, 0x15C)`; this is a source assertion, not independently verified compiled-layout evidence. [Canonical attributes](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/types.h#L20-L86)
- `ftPp_MotionVars` supplies union alternatives named `specials`, `unk_80123954`, and `speciallw`. The side-special alternative includes a pointer to a nested structure containing an integer and an `HSD_GObj*`; the other alternatives contain an integer or an integer plus a one-bit flag. Their numeric meanings and transition rules are not established here. [Canonical motion variables](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/types.h#L88-L109)

The complete rendered view matches the canonical declarations, with no name substitutions or reported parse errors. No frozen subjects, facts, or links exist for this assignment. No supported semantic correction warrants a proposal.

Status: synthesized; independent review and live promotion pending.
