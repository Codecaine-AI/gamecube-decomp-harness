## Mewtwo shared type declarations

The owned header defines character-specific fighter variables, per-motion variables, and special-move attributes; it contains no executable behavior.

- `ftMewtwo_FighterVars` declares three `HSD_GObj*` fields, an integer Shadow Ball charge field, and a Confusion boost boolean. The held-ball pointer's comment is explicitly tentative; these declarations alone do not establish creation, ownership, or cleanup lifetimes. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/types.h#L10-L18)
- Motion variables cover Teleport frame/stick/velocity storage and an unknown integer, a one-bit Confusion reflection field, and Shadow Ball flags, an unnamed integer, release lag, and floating-point charge level. `ftMewtwo_MotionVars` declares these as union alternatives, not simultaneously independent storage. The header does not establish transition rules or the meanings of unnamed fields. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/types.h#L20-L50)
- `ftMewtwoAttributes` groups declarations under Shadow Ball, Confusion, Teleport, and Disable: charging/recoil/lag parameters; aerial boost and a `ReflectDesc`; movement, duration, stick, angle and landing parameters; and gravity, terminal velocity and offsets, respectively. Charge-cycle timing is questioned in the source, and Teleport retains an explicitly unknown parameter. Names and comments describe intended roles but do not prove runtime formulas, exceptional branches, or compiled offsets. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/types.h#L52-L93)

## Semantic review

Read all 96 canonical and rendered lines and exhausted both baseline enumerations. The rendered view reports zero parse errors and zero substitutions; its function-only renaming coverage supplies no additional evidence for field semantics. No supported correction or meaningful rename is established by this declaration-only assignment. There are no baseline subjects, facts, or links to retain or amend, so the proposal is empty.

Status: synthesized; independent review and live promotion pending.
