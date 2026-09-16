## Mario shared type declarations

`src/melee/ft/kinds/ftMario/types.h` defines fighter variables, special-move attributes, and motion-variable types; it contains no executable behavior.

- `ftMario_FighterVars` declares current and previous Megavitamin color values, tornado-charge and cape-boost flags, two object pointers, and a padding array. One pointer is named for the cape; the purpose of `x2240` is unspecified. These declarations do not establish object ownership or cleanup lifetimes. [Canonical lines 14–24](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/types.h#L14-L24)
- `ftMario_DatAttrs` groups side-special velocity/gravity and cape-item attributes, up-special mobility/landing/steering attributes, down-special movement attributes, and a cape reflection descriptor. The down-special `unk0` remains unidentified. Up-special landing lag is declared as `float`, whereas down-special landing lag is `s32`; no unit or numeric-state interpretation is established here. [Canonical lines 26–60](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/types.h#L26-L60)
- `ftMario_SpecialLw_ECB` declares byte and integer fields without explaining their interpretation. Its name alone does not establish how consumers use those fields. [Canonical lines 62–70](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/types.h#L62-L70)
- Side-special motion variables contain a reflection-enable flag. Down-special motion variables contain documented grounded horizontal momentum, an uncertain integer, a field documented as skipped, and a collision-related flag whose precise meaning remains unclear. `ftMario_MotionVars` is a union of these two records. The comment asking whether `unk` is set but never used is not proof of non-use. [Canonical lines 72–91](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/types.h#L72-L91)

## Semantic assessment

All 94 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; its function-only renaming scope supplies no independent validation of field names. Existing descriptive declarations are left intact, and uncertain fields remain uncertain. Offset comments and padding expressions are source declarations, not compiled-layout evidence. Runtime transitions, exceptional branches, and cross-file object lifetimes cannot be determined from this header alone.

The complete subject and link enumerations are empty, with no baseline facts or writable subjects. No supported correction or rename warrants a proposal.

Status: researched; no-change lead bypass; independent review and live promotion pending.
