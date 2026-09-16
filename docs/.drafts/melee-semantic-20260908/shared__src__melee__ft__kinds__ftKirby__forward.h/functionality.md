## Kirby shared forward header

This header includes common fighter declarations, aliases `struct Fighter` as `ftKb_Fighter`, and forward-declares `ftKb_DatAttrs`. It defines compositional `MotionFlags` constants for multijumps, dash attacks, native specials, capture movement, and copied specials. Most explicitly named aerial variants add `Ft_MF_SkipParasol`; selected loop/charged variants add `Ft_MF_Unk19`. `ftKb_MF_SpecialNFe` specifically derives from `ftKb_MF_SpecialNFeStart` plus `Ft_MF_SkipParasol`, despite lacking an Air suffix. These are source-level compositions, not proof of their consumers' runtime behavior. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/forward.h#L1-L296)

`ftKirby_MotionState` enumerates Kirby-specific states beginning at `ftCo_MS_Count`, including jumps, dash attacks, capture/eat/drink/spit states, native specials, and copied-special families. Its `SelfCount` subtracts the common-state count. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/forward.h#L298-L504)

`ftKb_Submotion` is a separate enumeration beginning at `ftCo_SM_Count`, with its own Count and SelfCount. It is not a one-to-one replica of the motion-state list: for example, the motion-state enum contains paired capture/drink/spit states where the submotion enum declares single corresponding names. Numeric suffixes and differing names are preserved without inferring undocumented behavioral distinctions or state-to-animation mappings. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/forward.h#L506-L696)

All canonical and rendered pages were reviewed. Rendered output reports zero substitutions and zero parse errors throughout; there are no proposed names to independently validate. The frozen subjects and links enumerations are empty. No factual correction or supported naming change is proposed. Unknown flag semantics, runtime transitions, cross-file resource lifetimes, and compiled placement are not established by this declaration-only header.

Status: researched; no-change lead bypass; independent review and live promotion pending.
