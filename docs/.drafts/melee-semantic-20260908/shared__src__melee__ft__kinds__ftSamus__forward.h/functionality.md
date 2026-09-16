### Samus forward declarations and motion identifiers

`src/melee/ft/kinds/ftSamus/forward.h` aliases `struct Fighter` as `ftSs_Fighter` and defines Samus-specific motion flag combinations and enums.

- The shared special-motion flags combine `SkipModel`, `SkipItemVis`, `UnkUpdatePhys`, and `FreezeState`. Neutral, side, down, and up specials extend this base differently; notably, up-special flags do not add `SkipThrowException`. Air variants add `SkipParasol`; smash side-special variants additionally add `SkipRumble`. `ZairCatch` uses a separate combination of `SkipModelPartVis` and `SkipMetalB`. These are source-level flag compositions, not proof of their runtime effects. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/forward.h#L7-L44)
- Motion-state and submotion enums each define 18 corresponding entries, ordered from `SpecialLw` through `AirCatchHit`. They begin at distinct symbolic bases, `ftCo_MS_Count` and `ftCo_SM_Count`; matching order does not establish identical absolute numeric values. Each ends with a count sentinel and a self-count computed by subtracting its common base. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/forward.h#L46-L90)

The rendered view matches the canonical header, with no name substitutions or parse errors. No baseline subjects, facts, or links exist for this assignment, and no semantic correction is warranted. This header contains no executable branches or resource-lifetime implementation; no compiled layout claims are made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
