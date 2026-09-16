## Mewtwo forward declarations

This header defines special-move motion-flag combinations and separate motion-state and submotion enums. The canonical and rendered views were read completely (96 lines); rendering reports no parse errors or substitutions. The frozen baseline contains no subjects, facts, or links, so no semantic corrections are proposed.

### Motion flags
The common special mask combines `Ft_MF_SkipModel`, `Ft_MF_SkipItemVis`, `Ft_MF_UnkUpdatePhys`, and `Ft_MF_FreezeState`. Specialized masks add the explicitly named fast-fall, graphics, throw-exception, hit-status, or color-animation flags. Defined airborne variants add `Ft_MF_SkipParasol`. The neutral-special mask adds `Ft_MF_Unk19`; neutral collision flags alias `ftCommon_GroundAirColl_MF`, with the loop collision variant additionally preserving SFX. Unknown flag meanings and the underlying common collision mask are not inferred from their names. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/forward.h#L7-L44)

### Distinct state and submotion sequences
The motion-state enum begins at `ftCo_MS_Count` and defines 20 character-specific states. The submotion enum begins at `ftCo_SM_Count` and defines 19 character-specific entries. Both provide terminal counts and relative self-count expressions. Their Hi sequences are deliberately preserved as written: motion states place `SpecialHiLost` before `SpecialHi` and include `SpecialAirHiLost`; submotions place `SpecialHi` before `SpecialHiLost` and contain no `SpecialAirHiLost` entry. These declarations do not establish a one-to-one runtime mapping or absolute numeric bases. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/forward.h#L46-L93)

No function bodies, exceptional execution branches, or resource-lifetime operations are present in this header. No compiled section or layout conclusions are drawn.

Status: researched; no-change lead bypass; independent review and live promotion pending.
