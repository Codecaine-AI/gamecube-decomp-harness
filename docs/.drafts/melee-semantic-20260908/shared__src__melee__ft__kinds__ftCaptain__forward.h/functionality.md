## Captain forward declarations and motion identifiers

`src/melee/ft/kinds/ftCaptain/forward.h` declares the attribute structure and motion-variable union without defining their contents. It includes the fighter and common-fighter forward headers. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/forward.h#L1-L8)

The header defines special-motion flag combinations. The Captain base explicitly adds `Ft_MF_KeepSfx` to `ftCo_MF_Special`; neutral-special flags add `KeepFastFall`, side-special flags add `KeepGfx`, and down-special flags add `KeepColAnimHitStatus`. The listed aerial variants and down-special rebound add `SkipParasol`. Both aerial side-special constants have identical expressions. Up-special flags instead derive directly from `ftCo_MF_Special`, adding `KeepFastFall` and `KeepGfx`; they do not explicitly add Captain's `KeepSfx` bit. This distinction is preserved without assuming the numerical contents of the common base. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/forward.h#L10-L36)

The motion-state and submotion enums each introduce 23 entries starting at their respective common count, followed by total-count and self-count constants. They cover six item-swing entries and the listed special-motion variants. Their order must not be treated as an identity mapping: motion states place `SpecialAirLwEndAir` before `SpecialLwEndAir`, whereas submotions reverse those names. The first up-special throw is named `SpecialHiThrow` in motion states and `SpecialHiThrow0` in submotions; both also contain `SpecialHiThrow1`. Absolute identifiers and runtime state-to-submotion mappings are not established by this header alone. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/forward.h#L38-L92)

## Semantic review

All 95 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; it supplies no independent behavioral evidence. There are no frozen subjects, facts, or links to retain or correct. No supported naming correction or additional scoped fact proposal is warranted. This declaration-only file establishes neither runtime branches and cross-file lifetimes nor compiled section placement.

Status: researched; no-change lead bypass; independent review and live promotion pending.
