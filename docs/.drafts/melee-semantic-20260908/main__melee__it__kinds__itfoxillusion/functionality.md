## Illusion/Phantasm ghost article

This module implements the three-state article shared by Fox Illusion and Falco Phantasm. The fighter-side dash animation consumes command variable 2 when its value is **1**, calls `it_8029CEB4` with the appropriate character-specific item kind, and retains a successful result. The factory returns NULL on allocation failure; initialization and subsequent setup occur only on success.

### Initialization and active states

`it_8029CFF0` loads the first article attribute into `xD44_lifeTimer`, clears `xD5C`, caches the model's joint descriptor, and selects item state **1 exactly when the owner's ground_or_air value equals 1**, otherwise state **0**. It initializes the secondary-model pointer to NULL. The two active states share animation behavior and owner-history-following physics; their numeric distinction is preserved rather than inferred from callback names alone.

The active animation callback creates a secondary JObj when the owner exists, its command value is **2**, and no secondary model is retained. Creation occurs **before** the owner-removal check. The constructor loads the cached joint descriptor, copies the primary model's rotation, applies item scale, and returns the hierarchy for the caller to store. Calling it with an already populated secondary pointer reports `illusion add twice.` and loops forever.

A missing owner or an owner outside the inclusive `ftFx_MS_SpecialSStart` through `ftFx_MS_SpecialAirSEnd` interval requests immediate removal without decrementing the timer. Otherwise, each active animation update subtracts 1.0F; a nonpositive result is clamped to zero and enters state 2 rather than immediately destroying the article.

Active physics uses owner-history index 1 for the article position and primary JObj X rotation. When the secondary model exists, index 3 supplies its translation and X rotation. Fighter-side code independently establishes these arrays as rolling position and X-rotation histories. Missing owners suppress these transform updates.

### Final phase and teardown

`it_8029D798` loads attribute 1 as the second lifetime, calls the shared primary-model presentation helper, and selects state 2. Final animation checks owner removal before decrementing its timer; final expiration clamps the timer and returns true. Final physics only updates the optional secondary model's **translation** from history index 3; it does not refresh its rotation or the primary position. Both lifetimes therefore need not be exhausted before removal.

All three collision callbacks ignore their input and return false. This prevents callback-driven stage-collision destruction, but does not imply that the article has no damaging hit behavior or that generic collision maintenance is skipped. The damage-dealt callback clears `xCA8` and returns false; the field's stronger semantic meaning remains unspecified.

Drawing captures the secondary pointer, runs common item drawing, then conditionally displays the additional hierarchy using the render-pass mask lookup. Destruction conditionally removes that hierarchy and always clears the secondary pointer, owner, and flag x13. The reference-invalidation wrapper separately delegates matching-reference cleanup to `it_8026B894`; the surrounding fighter-removal loop makes its own destruction decision.

### Semantic review

Existing Draw, Spawn, CreateGhostJObj, Active_Anim, Spawned, EnterFinalGhost, and EvtUnk hypotheses remain compatible with canonical behavior. They are semantic reconstructions, not recovered original spellings. The header renderer leaves `it_8029CD78` and `it_8029CEB4` unchanged with `shadowed_binding` diagnostics even though their definitions receive proposed names. No naming change is warranted solely to compensate for that renderer issue.

The ledger retains 100 facts and 31 links, marks nine section-related facts and one section-related link unresolved, and supersedes one module data-flow summary to preserve early-removal branches. Source literals and initializers do not establish compiled section sizes, pool membership, padding, or entry byte layout.

Status: synthesized; independent review and live promotion pending.
