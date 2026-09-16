## Ness bat article

The unit implements two fighter-attached configurations of `It_Kind_Ness_Bat`. The normal constructor accepts position, attachment part and facing direction, clears four item-command variables, retains the fighter, initializes lifetime timers with 1200.0f, and attaches the successfully created article. The alternate constructor derives position and facing from the fighter, flattens Z, initializes zero velocity and damage, sets all four command variables to one, retains the fighter and attaches the article. Both constructors return NULL for a null fighter or failed creation.

Pickup selects numeric state 1 if **any** command variable is nonzero, otherwise state 0, then invokes the common trailing helper. The two table entries use animation identifiers 0 and -1 respectively; animation identifier -1 is not the state index.

State 0 updates the child subtree's visibility from command variable 0: zero shows it, nonzero hides it. It requests termination when the stored fighter is absent or the AttackS4 predicate requests removal. That predicate checks whether the fighter has left AttackS4 or lacks a tracked bat; it does not compare the tracked bat against this article. Cleanup clears the fighter-side handle only when the stored fighter is non-null and equals the generic item owner. Item-side references are cleared on the terminating path regardless of that equality. Explicit teardown separately clears item references before calling common removal; fighter callers clear their reciprocal handle after the call, including animation-end and interruption paths.

State 1 conditionally copies the referenced fighter root's Y scale uniformly to the bat root. It guards the object, Item payload and fighter reference, and its predicate accepts only Sleep and DeadUpFallHitCameraIce. Alternate creation also occurs during DeadUpStarIce, whose caller supplies separate scale configuration; that motion is not accepted by the per-frame scale predicate. State 1 always returns false, including when ownership is absent, so these callbacks do not establish its eventual external cleanup.

Both physics callbacks are empty and both collision callbacks return false. This local inactivity does not imply absence of fighter-side hit or reflection processing. The unknown-event callback merely forwards both pointers unchanged to `it_8026B894`; no specific interaction trigger is established.

## Semantic assessment

Existing constructor and pickup names remain useful and supported by canonical behavior and actual callers. Other retained explanations accurately describe the source, subject to the explicit ownership-cleanup correction and unresolved compiled-section claims. The header agrees with the implementation signatures. Its rendered view leaves the two constructor declarations unchanged because of `shadowed_binding`, although their definitions are substituted in the rendered C file; this is a renderer limitation, not a semantic naming contradiction. No source-only inference is used to establish compiled section size or placement.

Status: synthesized; independent review and live promotion pending.
