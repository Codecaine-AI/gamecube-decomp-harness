# Mewtwo Shadow Ball semantic review

The hash-bound librarian handoff establishes complete canonical/rendered coverage of both owned files, all 108 frozen subjects, all 273 facts, and all 109 links. The distinct lead independently read every proposed fact's canonical citations and all upstream contradiction evidence, and reconciled proposal.json with functionality.md. Unchanged research dispositions are inherited.

## Functionality

The translation unit implements paired grounded and aerial Shadow Ball Start, Loop, LoopFull, Cancel, and End phases. Entry preserves stored charge while initializing command variables, callbacks, local counters, and an initial release lockout when stored charge is zero. Grounded entry clears vertical velocity; aerial entry halves it.

Startup creates a held Shadow Ball at a right-shoulder-relative position. Creation can retry after failure because the command is not consumed. Charging uses a separate iteration counter after the initial lockout, increments persistent charge, clamps it at the configured maximum, and enters a full-charge holding loop with completion feedback. Cancellation removes the held item and associated presentation without consuming stored charge. Release passes charge and facing-dependent launch parameters to the item, applies recoil, consumes charge, and clears the held references while preserving the ordinary item slot.

Physics delegates to common grounded friction/movement or aerial gravity/friction. Collision callbacks preserve the current move phase across ground/air transitions and refresh lifecycle callbacks. Grounded animation completion uses the common action-ending routine, whose normal Wait result has exceptional branches. Aerial End selects ordinary Fall for zero landing lag and an alternate post-special transition otherwise.

## Important distinctions

- `ftMt_Init_OnTakeDamage` calls the misleadingly named `ftMt_SpecialN_OnDeath`, which preserves charge only when it exactly equals the configured maximum. `ftMt_Init_OnDeath2` calls `ftMt_SpecialN_OnTakeDamage`, which resets charge unconditionally.
- The held-item callback separately checks removal, cancellation, and charge-query failure. The removal predicate includes Cancel states and tests `x2071_b6`; the cancellation predicate excludes Cancel states from its continuing-state set.
- Aerial startup clears `isFull` before testing it. Aerial full-loop animation writes `x2348 = false`, whereas grounded full-loop animation writes true.
- Input uses pressed-button masks. B suppresses the LR alternative even when positive release lag prevents firing. Grounded common-action handling precedes explicit A/B/LR handling.
- Release compares charge for sound selection after resetting it. Recoil uses two independent OR-guarded assignments, not an exclusive ground/air branch.
- The charge-audio helper's nested zero-crossing branch is unreachable under its enclosing positive-tracker guard.
- `ftMt_SpecialN_Shoot` delegates to a distinct, Mewtwo-kind- and command-gated forward-throw Shadow Ball spawn. It is not the held neutral-special release path.

## Disposition summary

Retain 249 supported facts; adopt corrections for 10 facts; leave 14 anonymous-section facts unresolved because source declarations do not prove compiled section associations or layout. Retain 105 links and leave four section-dependent links unresolved. Existing historical duplicate links remain separate records. No entities, links, merges, or follow-up proposals are created.

Rendered views parsed successfully. Their substitutions were treated as hypotheses, not independent evidence. In particular, `EnvironmentCollision_AllowGroundToAir` is polarity-confusing at callers that transition when its result is false; this remains an owner-level naming question.

The handoff's stale unresolved note stating that baseline review remained incomplete is not carried forward: its completed coverage and final disposition counts supersede that progress note.

Status: synthesized; independent review and live promotion pending.
