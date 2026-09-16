## Purin forward declarations

The header defines special-motion flag combinations and separate motion-state and submotion enumerations.

- The shared special mask combines `Ft_MF_SkipModel`, `Ft_MF_SkipItemVis`, `Ft_MF_UnkUpdatePhys`, and `Ft_MF_FreezeState`. Hi, Lw, N, and S variants add distinct preservation flags; aerial variants add `Ft_MF_SkipParasol`. Charged neutral adds `Ft_MF_Unk19`, including through the canonically named `ftPr_SpecialAirNCharged`. These are symbolic compositions, not evidence resolving the unknown flags' runtime meanings. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/forward.h#L7-L39.
- `ftPurin_MotionState` and `ftPr_Submotion` each enumerate five aerial jumps followed by neutral, side, up, and down special variants. Each sequence starts at its respective common enum count and defines its own count and self-count. The distinct bases must not be treated as proof of equal absolute numeric IDs. Ground neutral motion-state names use `Loop`, `Full`, `Release`, and `Turn`, whereas the corresponding submotion names use `ChargeLoop`, `ChargeFull`, `ChargeRelease`, and `StartTurn`; this naming difference alone does not justify a correction. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/forward.h#L41-L113.

All 116 canonical and rendered lines were reviewed. The renderer reported zero substitutions and zero parse errors. This header supplies no implementation establishing transition behavior, resource lifetimes, or compiled layout. The frozen baseline contains no subjects, facts, or links, so there are no retention or exception entries. No supported semantic change is proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
