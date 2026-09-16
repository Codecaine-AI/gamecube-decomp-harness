## Challenger Approach flow

The translation unit defines three ordered local states—Approach, Versus and Prize—plus a terminator. Each descriptor carries a preload kind, callbacks and scene payload pointers. The header declares the three entry callbacks.

Approach entry copies the challenged fighter and human controller slot into presentation data and prepares archive resources. The separate Approach presentation owns the 180-frame input guard and A/Start dismissal. Versus entry initializes rules and players, disables the timer, selects stock mode and a challenger-dependent stage, configures human slot 0 and CPU slot 1, applies nametags and rumble, and obtains retry-sensitive CPU difficulty. For supported challengers, the helper computes 5 minus twice the saved failure count, clamped to 0–9; its nametag argument is unused.

Versus exit forwards elapsed seconds and standing field `xE` to accounting. It unlocks the challenged fighter only when the outcome is neither no-contest nor retry and player zero has nonzero stocks; otherwise it records failure. Following reward evaluation, absence of pending numbered or trophy notifications causes an explicit return-mode request. The notification gate itself does not select a follow-up. Prize exit always stages `ChallengerData.curr_mode` and then publishes the pending transition.

## Prize queue and exceptional behavior

`gm_801BFC60`, rendered as `gm_AppendUnlockNotification`, is appropriately named. Ordinal zero initializes the static root; later calls allocate and link records. Allocation failure returns the incoming cursor unchanged. Callers nevertheless advance their ordinal and snapshot bookkeeping, so a complete notification list is not guaranteed.

Prize entry clears two regions of the static 0x170-byte workspace, collects numbered messages and trophy notices, reevaluates progression, then scans again. Message flags suppress previously selected IDs. Trophy selection instead requires a pending trophy whose current low-byte count exceeds its snapshot **or is zero**; this is not unconditional deduplication. Trophy registration and acquisition counts are distinct: `Toy_SetUnlockState(id, 1)` adds one to the active count with saturation rather than merely assigning a boolean.

The final order is `gm_80172174`, `gm_80174180`, conditional tail null-termination, then archive setup. With no selected records, this callback does not reset the static root. The root is defined in `if_2FD9.c`; allocated nodes survive this producer callback for downstream presentation. Their ultimate reclamation was not established in this pass.

## Semantic assessment

Retain the supported names and explanations explicitly recorded in the checkpoint. Correct the preload-callback claim, unsupported compiled-section wording, overly strong deduplication/completeness claims, final-call ordering and interpretation of the notification gate. Canonical and rendered owned files were reviewed completely. Rendered substitutions are hypotheses, not independent evidence. Source declarations and size assertions do not establish compiled section layout.

Status: synthesized; independent review and live promotion pending.
