## Mario forward declarations

`src/melee/ft/kinds/ftMario/forward.h` defines motion-flag combinations and two distinct enum ranges; it contains no executable functions.

### Flag combinations
The shared `ftMr_MF_Special` combines `Ft_MF_SkipModel`, `Ft_MF_SkipItemVis`, `Ft_MF_UnkUpdatePhys`, and `Ft_MF_FreezeState`. Neutral special adds `KeepFastFall` and `SkipThrowException`; up special adds `KeepFastFall`, `KeepGfx`, and `KeepSfx`; down special adds `KeepColAnimHitStatus` and `KeepSfx`. Their aerial variants additionally include `SkipParasol`. Side special instead adds `KeepGfx`, `SkipModel`, and `SkipColAnim`; its repeated `SkipModel` is redundant in the bitwise OR, not a separate behavior. No dedicated aerial-side-special flag constant is declared here. These are source-level compositions, not independent proof of the flags' runtime effects. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/forward.h#L7-L30)

### Separate enum ranges
`ftMario_MotionState` starts at `ftCo_MS_Count`, contains two appeal states followed by ground/air pairs for neutral, side, up, and down special, and therefore defines ten local states. `ftMr_Submotion` starts independently at `ftCo_SM_Count` and contains only the eight special-move entries. Each enum defines an end count and a self-count relative to its own common base. Absolute numeric bases and any runtime mapping between the two enums are not established here. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/forward.h#L32-L58)

### Semantic review
The full canonical and rendered file was reviewed. The rendered view reports zero substitutions and zero parse errors; there are no proposed names to validate. Subjects, facts, and links are all absent from the frozen baseline for this assignment. No factual correction or supported rename is warranted, and no compiled placement or cross-file lifetime claim is made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
