## Fox forward declarations and state constants

The complete canonical and rendered `src/melee/ft/kinds/ftFox/forward.h` were reviewed. The rendered view reports zero substitutions and zero parse errors; there are no proposed names or baseline explanations requiring correction.

- The header includes fighter/common forward declarations and forward-declares `ftFox_DatAttrs`; it does not define that structure's layout. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/forward.h#L1-L7)
- Motion-flag constants compose shared special-move masks with additional flags for neutral, side, up, down, aerial, and loop variants. Aerial variants explicitly add `Ft_MF_SkipParasol`; neutral/down loop variants add `Ft_MF_Unk19`. Unknown flag names are preserved rather than assigned speculative meanings. These declarations do not establish runtime transition behavior or compiled placement. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/forward.h#L9-L49)
- Motion states and submotions are separate sequential enums beginning at `ftCo_MS_Count` and `ftCo_SM_Count`, respectively. Their self-counts subtract their respective common bases. Motion states include `SpecialAirHi` and ground/air down-special turn entries absent from the submotion enum; the lists must not be treated as interchangeable. Absolute common-base values and runtime state-to-animation mappings are not established here. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/forward.h#L51-L126)
- `ftFx_SpecialNIndex` enumerates six ground/air neutral-special phases followed by back/up/down throw entries. Comments document different subtraction bases for the special and throw groups; they are not executable conversion logic. The `None` entry is commented out, not an active enumerator. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/forward.h#L128-L141)

Subject and link enumeration both returned empty results. No supported semantic correction requires a proposal.

Status: researched; no-change lead bypass; independent review and live promotion pending.
