## Popo forward declarations

`src/melee/ft/kinds/ftPopo/forward.h` defines motion-flag combinations and parallel motion-state/submotion enumerations, rather than executable behavior.

### Flag combinations
The common special-move mask combines `Ft_MF_SkipModel`, `Ft_MF_SkipItemVis`, `Ft_MF_UnkUpdatePhys`, and `Ft_MF_FreezeState`. Down-special adds `KeepColAnimHitStatus`; neutral-special adds `KeepFastFall` and `SkipThrowException`; side-special adds `KeepGfx` and `KeepSfx`; up-special extends the side-special mask with `KeepFastFall`. The `MS_358` mask extends the down-special mask with `SkipParasol`; the airborne neutral, side, and up masks likewise add `SkipParasol` to their respective masks. These are source-level compositions, not independent proof of the runtime semantics of each flag. [Canonical definitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/forward.h#L7-L33).

Collision masks use `ftCommon_GroundAirColl_MF`: up-special adds `KeepGfx` and `SkipHit`, down-special adds `KeepGfx` and `KeepSfx`, and side-special adds all three. These differences are preserved rather than treating the masks as interchangeable. [Collision masks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/forward.h#L35-L42).

### Enumeration structure
Both enumerations contain 26 character-specific entries in matching suffix order, covering neutral, side, up, and down specials and additional numbered variants. Motion states begin at `ftCo_MS_Count`, whereas submotions begin at `ftCo_SM_Count`; their matching relative ordering does not establish equal absolute IDs. Each ends with a count sentinel and a self-count computed by subtracting its respective common base. The header does not identify runtime transitions, partner roles, or cross-file object lifetimes. [Motion states](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/forward.h#L44-L73); [submotions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/forward.h#L75-L104).

### Semantic review outcome
All 107 canonical and rendered lines were reviewed. The rendered view reported zero substitutions and zero parse errors; it supplies no alternative names requiring correction. Subject and link enumeration returned no baseline records, so there are no facts or links to retain or supersede. No supported naming correction or writable-subject knowledge addition was identified. No compiled layout or section claims are made.

Status: synthesized; independent review and live promotion pending.
