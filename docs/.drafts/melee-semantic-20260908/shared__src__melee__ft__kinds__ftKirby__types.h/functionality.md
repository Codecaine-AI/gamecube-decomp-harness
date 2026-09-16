## Kirby shared type declarations
This header declares fighter variables, data attributes and a motion-variable union; it contains no executable move logic. `ftKb_FighterVars` groups hat/model resources with miscellaneous state and copied-ability item/effect pointers. Pointer declarations and item comments do not establish creation, ownership or cleanup lifetimes (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/types.h#L18-L68).

`ftKb_DatAttrs` groups midair-jump parameters, Kirby's native specials and copied neutral-special parameter blocks. The separate five-member `ftKb_SpecialNMs_DatAttrs` is embedded twice as `ms` and `fe`; the main attributes end with absorption/reflection descriptors. Field names document intended parameters, not runtime formulas or toggle encodings (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/types.h#L70-L380).

`ftKb_MotionVars` provides alternative motion-state representations, including imported Game & Watch, Mars and Ness structures and local Peach, up-special, Bowser and down-special structures. Up-special `x8` and `x10` explicitly retain both integer and floating interpretations. No active-member transition or reset policy is defined here (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/types.h#L382-L427).

All canonical and rendered lines were reviewed. The renderer makes no substitutions; there are no frozen subjects, facts or links to revise or retain. No supported semantic correction warrants a proposal. Source offset comments and ASSERT_SIZE declarations are not independent compiled-layout evidence.

Status: synthesized; independent review and live promotion pending.
