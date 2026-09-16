### Fox SpecialN loop-input helper
`ftFox_SpecialN_CheckLoopInput` obtains the fighter with `GET_FIGHTER`. When `cmd_vars[0]` is nonzero and `input.pressed_buttons` contains `HSD_PAD_B`, it sets `mv.fx.SpecialN.isBlasterLoop` to `true`. Otherwise it leaves that flag unchanged; it does not clear it or itself perform a state transition. The exact meaning of the nonzero command variable, flag reset lifetime, and downstream loop handling are not established by this header. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/inlines.h#L7-L14.

The existing helper name fits its input-checking behavior. The rendered view matches canonical source with no substitutions or parse errors. No baseline subjects, facts, or links exist for this assignment, and no supported naming correction is needed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
