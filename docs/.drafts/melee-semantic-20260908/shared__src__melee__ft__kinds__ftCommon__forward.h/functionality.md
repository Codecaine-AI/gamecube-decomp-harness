## Common fighter declaration header

`src/melee/ft/kinds/ftCommon/forward.h` supplies forward typedefs, composite `MotionFlags` constants, and common fighter identifier enums; it contains no function implementations.

- The header includes the fighter forward header and forward-declares `ftHurtboxInit` and `ftCollisionBox`. Its jump-input enum distinguishes none, left stick, C-stick, and X/Y. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/forward.h#L1-L19)
- Named flag combinations cover movement, attacks, landing, items, damage, recovery, ledges, capture, throws, death, and special states. They are expressed through bitwise combinations of imported flags and earlier constants. These expressions establish composition, not independently verified runtime effects of each bit. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/forward.h#L21-L285)
- `ftCommon_MotionState` enumerates common states, including distinct airborne, empty-item, directional, character-specific capture, and boss-capture variants. It begins with `ftCo_MS_None = -1` and ends with `ftCo_MS_Count`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/forward.h#L287-L631)
- `ftCo_Submotion` is a separate enumeration with its own ordering, unknown placeholders, `None = -1`, and count sentinel. Similar MS/SM names must not be treated as interchangeable numeric identifiers or evidence of a one-to-one mapping. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/forward.h#L633-L931)
- `ftCo_Surface` distinguishes none, left wall, right wall, and ceiling. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/forward.h#L933-L938)

## Semantic review

All 941 canonical and rendered lines were reviewed. The rendered views reported zero substitutions and zero parse errors; there are no proposed function names to assess. The frozen baseline contains no subjects, facts, or links, confirmed by terminal enumeration pages. No supported correction or meaningful in-scope knowledge change was identified, so the proposal is empty. This declaration-only review makes no claims about compiled layout, runtime exceptional branches, or cross-file capture/object lifetimes.

Status: synthesized; independent review and live promotion pending.
