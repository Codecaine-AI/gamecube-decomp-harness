## Greenhouse article

This unit implements Mr. Game & Watch's fighter-attached insecticide sprayer for the initial jab and rapid-jab sequence. Construction initializes a Greenhouse spawn descriptor, attempts item creation, and attaches only a successful result to the requested fighter part. Failure returns NULL. The common initializer supplies zero initial velocity; this source-level behavior does not prove compiled constant-pool placement.

### States and initialization

The four table entries use matching animation IDs 0–3. States 0, 1, and 3 share `itGamewatchGreenhouse_Motion3_Anim`; state 2 uses `itGamewatchGreenhouse_Motion2_Anim`. All physics and collision callback slots are NULL. Canonical fighter dispatch maps the four setters to Attack11, Attack100Start, Attack100Loop, and Attack100End respectively.

Pickup always clears both item-command variables. With no owner it performs neither a state transition nor the final animation/script advancement. With an owner, it selects state 0 during Attack11 and state 1 for every other motion: despite its name, `ftGw_Attack11_ItemGreenhouse_CheckAttack11` returns true outside Attack11. Thus pickup's state-1 branch is broader than the dedicated rapid-jab-start dispatch.

### Lifetime and cleanup

Both animation callbacks return false while the owner remains in the inclusive Attack11-through-Attack100End interval. Owner loss or departure from that interval invokes the destruction notifier and returns true; the common item animation dispatcher consumes true by initiating teardown. State 2 first requests re-entry into state 2 when `it_80272C6C` returns zero, then checks lifetime. This order also applies when the article is about to complete.

`Destroyed` is an owner notification, not itself the common teardown routine. Fighter-side notification exits hitlag on the still-tracked sprayer before clearing its stored reference. Explicit removal guards the resolved Item, invokes that notification, and then calls common teardown; a live ownerless article still reaches teardown. The item-side hitlag wrappers forward unchanged arguments, while their fighter-side callers provide the tracked-pointer guards.

The two-argument event callback delegates reference cleanup and discards its boolean result. Matching owner, reflector, absorber, source-fighter, secondary-fighter, and toucher references are cleared independently; clearing the source-fighter reference also resets source player to 6. The callback itself does not change motion or destroy the article, although surrounding item iteration can subsequently destroy it.

### Semantic assessment

Existing descriptions and inferred function names fit the canonical behavior and rendered reading view. Numeric setter names and phase-oriented names are both supported; stylistic uniformity alone does not justify replacement. `Motion3_Anim` must not be interpreted as exclusive to state 3. The rendered header reports a shadowed Spawn binding, but its declaration remains readable and agrees with the canonical definition. No proposal writes are necessary. Three facts and three links assigning source-level zero initialization to the compiled `.sdata2` pool remain unresolved without compiled evidence.

Status: synthesized; independent review and live promotion pending.
