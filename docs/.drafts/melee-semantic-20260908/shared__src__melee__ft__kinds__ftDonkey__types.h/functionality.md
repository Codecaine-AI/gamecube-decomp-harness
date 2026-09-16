## Donkey Kong shared type declarations

`src/melee/ft/kinds/ftDonkey/types.h` declares fighter-specific variables, a motion-variable union, and the `ftDonkeyAttributes` structure. It contains no executable behavior.

- `ftDonkey_FighterVars` declares two signed integer fields, with source offset comments `0x222C` and `0x2230`; their gameplay roles are not explained here. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/types.h#L6-L9)
- `ftDonkey_MotionVars` provides a six-integer `specialn` member, a one-integer `speciallw` member, and three additional structures exposed as `unk5`, `unk7`, and `unk8`. Each unknown state structure has an explicit rename TODO. These numeric labels do not establish runtime state identities, and the union declaration alone does not establish initialization, transition, or cleanup lifetimes. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/types.h#L11-L44)
- `ftDonkeyAttributes` declares two motion-state integers, six unnamed floats tentatively associated by comment with Cargo Hold, and a named `cargo_hold` group for turn speed, jump startup lag, and landing lag. The comment's uncertainty should remain intact. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/types.h#L46-L63)
- The remaining attribute groups are labeled Giant Punch (`SpecialN`), Headbutt (`SpecialS`), Spinning Kong (`SpecialHi`), and Hand Slap (`SpecialLw`). Existing field names describe swing counts, damage, movement, gravity, mobility, and landing lag, but this header does not demonstrate their consuming calculations. `x48_UNKNOWN` and the three Hand Slap floats retain unspecified meanings. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/types.h#L65-L100)

## Review outcome

All 103 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; it introduces no alternate names to validate. Subject and link enumeration both returned empty results, so there are no baseline facts or links to retain or correct. No supported semantic correction or meaningfully better name was established. No compiled-layout or runtime exceptional-branch claims are made.

Status: synthesized; independent review and live promotion pending.
