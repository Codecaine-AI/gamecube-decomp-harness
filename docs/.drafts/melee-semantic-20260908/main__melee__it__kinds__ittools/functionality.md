## Tools hazard lifecycle

This unit implements Flat Zone's five falling-tool variants. The stage caller selects a variant with `HSD_Randi(5)`, places it five units below the upper blast-zone boundary, and supplies randomized facing. The spawn wrapper creates a parentless `It_Kind_Tools` object and runs initialization only on successful allocation. Initialization retains the variant, selects its initial state and attributes, clears horizontal velocity, and assigns configured downward velocity. The observed variant domain is 0–4; these routines do not validate it.

The ten-entry state table has two callback families, not individual behaviors confined to states 4 and 9. States 0–4 rotate the model, decrement moving lifetime, apply variant-selected falling physics, and check environmental collision only when X or Y velocity is nonzero. Collision results intersecting mask `3`, moving-lifetime exhaustion, or damage dealt invoke the shared stop transition. Clank and shield-hit callbacks reproduce that transition.

Stopping clears X and Y velocity, initializes the terminal timer with exactly `(s32) attrs->x4 & 0xFFFE`, and selects `variant + 5`. This mask is not merely unrestricted bit-zero clearing, and the transition does not explicitly clear Z velocity. States 5–9 share a countdown animation callback: it decrements first, returns true at nonpositive lifetime, and otherwise alternates visibility using integer timer bit 1, reapplying the paired animation at frame zero on the visible branch. Terminal physics is empty; it does not enforce stationary velocity. The terminal collision callback explicitly handles nonzero XY velocity and can reset the paired state and terminal timer on qualifying collision.

Absorption performs the paired transition but then overwrites lifetime with zero. Its false return is not a promise of continued survival: absent an intervening timer change, the next terminal animation update returns true.

Received damage follows a separate path without changing motion-state index. Excess horizontal speed rejects the response without mutation. Otherwise lifetime is refreshed before associated-fighter validation, so an unsuitable non-null fighter produces a timer-only response. The full path derives direction from fighter-relative X position or the opposite recorded incoming direction, computes and caps first-hitbox damage with unsigned conversions, and assigns configured XY relaunch velocity. Attribute signs and values are not established here; upward and away describe the intended configured response rather than unconditional arithmetic guarantees.

Shield bounce delegates its result to the common shield handler. Reflection delegates to the canonical inline that performs common reflection processing and sets model Y rotation from resulting facing. The two-object cleanup callback clears matching interaction references through the shared helper and discards its owner-match result. Cleanup itself does not destroy the item, but its dispatcher may subsequently destroy a flagged item using the owner cached before the callback.

## Semantic review

All owned canonical and rendered pages, all 44 subjects, and all 25 links were reviewed. The ledger explicitly retains 96 facts and all 25 links, supersedes eight factual explanations, and leaves five compiled-storage claims unresolved. Existing inferred names remain supported as hypotheses; `UnkMotion9` denotes the paired terminal family rather than literal state 9 alone. No equivalent wording was rewritten merely for style.

The rendered header leaves the pointer-returning spawn declaration unchanged with `shadowed_binding`, although the C definition renders as `itTools_Spawn`. This is a renderer issue, not contrary naming evidence. No compiled section sizes, literal-pool placement, or generated instruction layouts are established by this review.

Status: synthesized; independent review and live promotion pending.
