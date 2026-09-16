## Game & Watch forward-smash torch

This unit implements the attached GameWatch Fire article, not a free-flying fire projectile. Spawn initializes the requested item kind, attempts creation, and attaches only a successful result to the requested fighter part using the article's special attributes. Failure returns NULL. The fighter's setup supplies its left-hand position and facing direction and stores the returned torch reference.

The sole table entry is selected by motion-state index 0 and supplies animation ID 0, an animation callback, and null physics/collision callbacks. These two zero values have different roles. Pickup always clears two item-command variables and invokes the model-flag setter; state entry and immediate animation advancement occur only with a non-null owner.

The animation callback performs its model action when the current frame equals exactly 3.0f, before checking removal. It requests deletion if the owner is absent or no longer in ftGw_MS_AttackS4. Otherwise it changes the stored and JObj animation rate to zero when ftLib_800876D4 returns true, or one when false, suppressing redundant updates. The canonical query tests smash_attrs.state == 2; the rendered IsSmashAttackCharging label alone does not establish the meaning of that numeric state.

Explicit removal checks the resolved Item pointer, not the incoming GObj pointer, then notifies the owner before generic teardown. Owner notification exits hitlag through the fighter's still-tracked torch reference and then clears that reference. The animation removal path returns true after notification; the generic item dispatcher performs destruction. The paired EnterHitlag and ExitHitlag rendered names are supported independently by canonical fighter callback registration and callers.

EvtUnk forwards both references to the common relationship-cleanup helper and ignores its result. That helper independently clears matching owner, reflector, absorber, fighter/source, auxiliary-fighter and toucher references, resetting the source-player field to 6 when appropriate. It does not directly destroy the article. Owner loss subsequently makes the animation callback request removal, without notifying a missing owner. EvtRemoveReference remains a suitable descriptive hypothesis, not a recovered original name.

Both owned files were read completely in canonical and rendered form. Existing lifecycle knowledge and all 32 historical semantic links are explicitly retained in the checkpoints except for the five recorded fact exceptions. No compiled section size, placement or literal-pool contents are established by this source-only review.

Status: synthesized; independent review and live promotion pending.
