## Donkey Kong shared motion definitions

This header defines compositional `MotionFlags` constants and separate motion-state and submotion enums; it contains no executable callbacks.

### Flag families
The special-move masks derive from `ftCo_MF_Special`, with additional flags selected for individual moves. Air neutral, side, and up variants additionally include `Ft_MF_SkipParasol`. Neutral-special collision masks instead derive from `ftCommon_GroundAirColl_MF`; the non-cancel mask adds graphics, collision-animation hit-status, part-hit-status, and skip-hit flags. The down-special start and continuation masks differ by `Ft_MF_Unk19`. These are source-level compositions, not independently verified descriptions of runtime flag effects. Evidence: [lines 7–42](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/forward.h#L7-L42).

Cargo masks have a separate base and derive directional throw, wait, turn, walk, and jump combinations. Numerically named masks and unknown flag names remain uninterpreted rather than being renamed from their apparent associations. Evidence: [lines 44–97](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/forward.h#L44-L97).

### Enumeration boundaries
`ftDk_MotionState` begins at `ftCo_MS_Count` and enumerates heavy-object movement, cargo movement and throws, and special-move phases. `ftDk_Submotion` independently begins at `ftCo_SM_Count`. Each ends with a count sentinel and a self-count expressed relative to its common base. The motion-state enum includes four `ThrowAirF*` entries absent from the submotion enum; the two lists must not be treated as interchangeable indices. The `/* 172 */` comment beside `ftDk_MS_SpecialNLoop` is not an explicit enumerator assignment and does not establish its absolute numeric value. Evidence: [lines 99–195](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/forward.h#L99-L195).

### Semantic assessment
All 198 canonical and rendered lines were reviewed. The rendered view reports no substitutions or parse errors and introduces no alternative names. The frozen subject and link inventories are empty, so there are no existing facts or links to retain or correct. No supported naming correction is proposed. Consumer behavior, cross-file resource lifetimes, and compiled placement are not established by this declaration-only header.

Status: researched; no-change lead bypass; independent review and live promotion pending.
