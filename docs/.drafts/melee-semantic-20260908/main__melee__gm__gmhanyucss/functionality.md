## Hanyu CSS lifecycle

`gmhanyucss.c` defines a static `CSSData` payload and `gm_Mode_HanyuCss_States`: one state numbered 0 using `lbDvdPreload_2`, the two local callbacks, `GS_CSS`, the payload pointer, and a null secondary pointer, followed by a `-1` terminator. This establishes source-level storage and registration, not compiled section placement. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhanyucss.c#L7-L25)

`gm_801BED3C(GameModeState*)` obtains enter data and copies the complete VS configuration returned by `gmVsMelee_GetVsData()` into `CSSData.vs`. It then calls `gm_80164F18`; odd `match_type` values additionally call `gm_80164A0C(7)`. Canonical helper bodies independently establish that these set the unlockable-character bits and request clearing the bit mapped from character kind 7. The clearing helper does nothing when mapping returns `NUM_UNLOCKABLE_CHARACTERS`; 7 is not a setup-variant number. The mask operations preserve unrelated bits. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhanyucss.c#L27-L36), [clear helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L2411-L2420), [set helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L2496-L2506)

`gm_801BEDA8(GameModeState*)` retrieves the same enter payload. When `pending_scene_change == 2`, nonzero `match_type` is decremented and zero becomes 23. Every other pending value takes `(match_type + 1) % 24`. It then unconditionally copies `css->vs` back through `gmVsMelee_GetVsData()`. Thus the intended 0–23 selector ring is maintained for valid inputs; the backward branch does not normalize arbitrary out-of-range inputs. Neither a button meaning for numeric state 2 nor names for the 24 configurations are established here. [Exit](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhanyucss.c#L38-L54)

The static CSS payload survives individual callback invocations. Entry overwrites its VS member but does not reset `match_type` or `pending_scene_change`; exit updates the selector and commits VS data. Availability changes affect the shared mask obtained by external helpers, and this unit contains no restoration of its previous value. No disk-save behavior is established.

The rendered `gmHanyuCss_EnterCss` and `gmHanyuCss_ExitCss` names remain useful hypotheses supported by canonical registration and data direction, not by their rendered appearance. The exact MODE TEAM TEST → HANYU → SELECT CHAR route remains an externally attributed mapping requiring independent routing evidence.

The owned header only includes GM types and declares `gm_Mode_GOver_States`, not `gm_Mode_HanyuCss_States`. This is a canonical declaration mismatch worth investigating, not a renderer error or proof of a runtime defect. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhanyucss.h#L1-L9)

Status: synthesized; independent review and live promotion pending.
