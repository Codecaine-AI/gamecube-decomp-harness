## CliffAttack semantic review

The implementation recognizes A/B pressed input or acceptance by `ftCo_800DF6F8`, enters CliffAttack, and reports whether the transition occurred. CliffWait checks this gate before the adjacent CliffEscape gate. Both gates short-circuit their alternate predicates when direct button input succeeds.

Entry chooses CliffAttackQuick when damage is strictly below `p_ftCommonData->x488`, and CliffAttackSlow otherwise. It changes motion with arguments `Ft_MF_None, 0, 1, 0, NULL`, calls animation initialization and `ftCommon_8007E2F4(fp, 32)`, sets `x221D_b7` and `x221D_b5`, and immediately invokes CliffCatch physics. Neither the threshold's numeric value nor additional meanings for these flags are established here.

Animation, physics, and collision callbacks delegate unchanged to CliffClimb; IASA is empty. Shared animation processing calls the common completion handler when frames are exhausted. That handler distinguishes aerial completion from the non-aerial branch. Shared physics retains the stored ledge across updates, positions the fighter using facing and transformed animation offsets, grounds it when both relevant offsets are nonnegative, and enters Fall if the ledge becomes invalid. Collision processing gives aerial terrain contact priority over its fallback handler and uses a separate grounded update. The local grounding adapter forwards `user_data` to common grounding, including conditional airborne bookkeeping, velocity/resource updates, ECB unlocking, and supporting-floor validation.

The adjacent escape gate tests `input.pressed_buttons & HSD_PAD_LR`, then the alternate predicate only if necessary, and calls `ftCo_8009B040` on success. Its existing data-flow fact incorrectly spells the field `input.x668`; the proposal corrects that factual mismatch without changing the supported control-flow explanation.

Canonical and rendered C/header views were fully reviewed. The existing CliffAttack_CheckInput, CliffAttack_Enter, and CliffEscape_CheckInput hypotheses fit their canonical roles and need no cosmetic replacement. Rendered external helper names are not independent proof of their semantics. No compiled section contents, layout, or opcode matching are established by this source review.

Status: synthesized; independent review and live promotion pending.
