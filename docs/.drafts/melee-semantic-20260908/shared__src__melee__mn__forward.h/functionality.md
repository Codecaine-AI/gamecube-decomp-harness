## Menu forward declarations and identifiers

`src/melee/mn/forward.h` is a declaration-only shared header. Under `M2C`, `mnInfo_GObj` and `mnSoundTest_GObj` name distinct incomplete struct types; otherwise both alias `struct HSD_GObj`. It also forward-declares menu, character-selection, stage-selection, diagram, match-setup and sound-test types. `MenuKind8` and `MenuState8` are unsigned-char typedefs, separate from the corresponding enums. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/forward.h#L1-L38.

The header defines match-rule modes, stage-selection modes and an explicit CSS HUD icon numbering from 0x00 through 0x18. The icon enumeration is not interchangeable with character-kind numbering; the source explicitly notes omitted characters. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/forward.h#L40-L83.

`MenuKind` assigns menu identifiers 0–34, while `MenuState` declares states 0–5. These declarations establish numeric values, not transition behavior; placeholder names remain unresolved rather than being inferred from neighboring entries. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/forward.h#L85-L130.

Separate selection enums identify options within main, one-player, regular-match, stadium, versus, special-versus, settings, data, records, trophy and multi-man menus. Their values are local option indices, not global menu-kind identifiers. Three placeholder selections carry `hidden` comments; this header does not implement visibility checks. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/forward.h#L132-L220.

## Review outcome

All 223 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; there are no rendered naming hypotheses requiring correction. Subject and link enumeration both returned empty baselines, so there are no facts or links to retain or revise. No supported semantic correction warrants a proposal. This header alone establishes neither object lifetimes nor runtime exceptional branches, struct layouts, or compiled section placement.

Status: synthesized; independent review and live promotion pending.
