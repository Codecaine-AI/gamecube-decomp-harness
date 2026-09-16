## Zelda shared forward declarations

`src/melee/ft/kinds/ftZelda/forward.h` defines special-move motion-flag combinations and two distinct enumeration domains; it contains no executable routines.

- The common special-move mask combines `Ft_MF_SkipModel`, `Ft_MF_SkipItemVis`, `Ft_MF_UnkUpdatePhys`, and `Ft_MF_FreezeState`. Neutral, up, down, and side variants add different flags; each corresponding aerial mask adds `Ft_MF_SkipParasol`. The neutral and down collision masks have identical expressions based on `ftCommon_GroundAirColl_MF`, with `KeepGfx`, `KeepColAnimHitStatus`, and `SkipHit`. These are source-level compositions, not independently verified descriptions of the flags' runtime effects. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/forward.h#L7-L41)
- `ftZd_MotionState` declares 18 Zelda states starting at `ftCo_MS_Count`. Grounded and aerial up-special each distinguish `Start_0` and `Start_1`; side-special has start/loop/end entries, and down-special has two entries per ground/air form. The count sentinel and relative self-count follow the states. Numeric comments alongside some side-special entries are not explicit enum assignments; absolute values depend on the external common-state base. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/forward.h#L43-L64)
- `ftZd_Submotion` declares 16 Zelda submotions starting at `ftCo_SM_Count`, with one up-special start entry per ground/air form rather than the paired motion-state starts. It has its own count sentinel and relative self-count. This header does not establish runtime state-to-submotion mappings or the behavioral distinction between numbered states. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/forward.h#L66-L85)

## Semantic review

All 88 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors and preserves the canonical declarations. No naming correction is supported by this header alone. Subject and link enumeration both returned empty baselines, so there are no existing facts or links requiring retention or exception dispositions. No proposals are necessary. This review makes no compiled-layout, runtime-lifetime, or external flag-implementation claims.

Status: researched; no-change lead bypass; independent review and live promotion pending.
