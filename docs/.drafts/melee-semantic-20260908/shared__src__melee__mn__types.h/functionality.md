## Shared menu and match declarations

`src/melee/mn/types.h` defines shared data structures and enums, not executable menu logic. It provides M2C-only typed GObj views; outside M2C, `Menu_GObj` aliases `HSD_GObj`. It also declares basic menu, count and performance-label records, player initialization fields, match rules and nested match-start data. Unknown fields remain explicitly unknown. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/types.h#L12-L279)

`StartMeleeRules` includes timer, team, pause and gameplay settings plus lifecycle callbacks. Its comments document pause/unpause/pauser overrides gated by `x4_0`, with distinct default fallbacks. These are declaration-level descriptions, not independently verified caller behavior or callback lifetimes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/types.h#L160-L262)

Character selection declarations separate match types, selectable-character indices and icon-joint IDs. CSS records hold icon bounds, player-door selections, slider state, tags and KO-star references; stage selection embeds `VsModeData`. Numeric scene-change state 2 remains unnamed beyond its existing numeric identifier. The icon-state enum and field commentary should not be collapsed into an inferred transition model. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/types.h#L281-L533)

The remaining declarations cover animation-loop settings, menu dispatch metadata, VS Records screens and archive references, stat-row positioning, glyph variants, name entry, achievement information and sound-test user data. The animation comment explicitly gives `-0.1f` as the no-loop sentinel. VS Records distinguishes 21 fighter-mode stats from 24 name-mode stats; `VSSTAT_COUNT_FIGHTER` shares numeric value `0x15` with `VSSTAT_MOST_PLAYED`, serving a count rather than a separate stat. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/types.h#L535-L731)

## Semantic assessment

All 734 canonical and rendered lines were reviewed, and subject/link enumeration returned no records. There are no baseline facts or links to retain or correct and no writable subjects. The rendered view applies no substitutions and reports nine parse errors, so it supplies no independent confirmation of names. Existing declarations are left unchanged; no supported knowledge correction warrants a proposal. Pointer ownership, cross-file object lifetimes and runtime state transitions are not established by this header. Offset comments and size assertions are source evidence only, not compiled layout or section evidence.

Status: synthesized; independent review and live promotion pending.
