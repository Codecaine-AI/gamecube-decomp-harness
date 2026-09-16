## Pichu type declarations

`src/melee/ft/kinds/ftPichu/types.h` is a guarded declaration-only header including `Runtime/platform.h`. It defines `ftPichu_FighterVars` as a placeholder containing `char filler0[0x100]`, and defines `ftPichuAttributes` with two padding arrays and opaque `u32` members `x14`, `x18`, and `xDC`. No runtime behavior, state transitions, or cross-file lifetime rules are established here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPichu/types.h#L1-L18.

The offset comments beside `x18` and `x18_padding` are inconsistent with the declaration naming and padding arithmetic. They are preserved as uncertain source annotations, not treated as compiled-layout evidence. This header alone does not justify semantic field names.

The complete rendered view matches the canonical declarations, with no name substitutions or parser errors. There are no baseline subjects, facts, or links to retain or correct; no proposal is warranted.

Status: synthesized; independent review and live promotion pending.
