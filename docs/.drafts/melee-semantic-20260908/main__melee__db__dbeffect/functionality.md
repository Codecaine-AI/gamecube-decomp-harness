# Developer miscellaneous visual-effects control

## Canonical behavior

`src/melee/db/dbeffect.c` declares `db_MiscVisualEffectsStatus`, a signed C `int` with static storage duration and implicit zero initialization, and `void fn_CheckMiscVisualEffects(int player)`. The player argument selects debug input state; the handler itself performs no index validation.

Holding X while the selected slot reports a newly pressed D-pad-down bit increments the shared selector. An incremented value greater than 3 is reset to zero. From initialization, normal activations therefore cycle 0→1→2→3→0. Zero calls `ifAll_ShowHUD`; every nonzero result calls `ifAll_IsHUDHidden` and hides the HUD only if necessary. Without the chord, this handler changes neither selector nor HUD. It does not continuously reconcile HUD visibility with the selector.

The code checks only an upper bound, not a lower bound: an externally introduced negative value can remain negative and take the nonzero HUD branch. Signed overflow is not handled. The handler does not consume the stored press bit or enforce once-per-frame execution.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbeffect.c#L4-L21.

## Dispatch and cross-file lifetime

`db_RunEveryFrame` returns below `DbLKind_DebugRom`. Otherwise it refreshes two input slots when Master Hand or Crazy Hand is present, and four otherwise, before invoking this handler for all four indices. Thus the selector is shared across players and calls; simultaneous qualifying slots can advance it several times in one dispatch. In the two-slot refresh branch, slots two and three are still checked and may contain stale input state. All four visual-selector checks precede the camera checks and later miscellaneous-stage checks.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L229 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L247-L255.

External consumers in `dbcamera.c` independently test the same chord. One restores stage background and visibility for states zero and one, hiding the stage for other values. Another sets white background for state two and black for state three, with no corresponding write for other values. These are separately guarded consumers of shared state, not rendering operations performed by this translation unit. They can observe the selector after multiple player activations.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L130-L144 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L317-L328.

## Semantic assessment and repair

The complete canonical and rendered file agree. The renderer reports zero parse errors and zero substitutions; its unchanged function name fits the canonical behavior. No cosmetic rename or equivalent fact rewrite is warranted. Existing function/module facts are retained with their normal-operation and local-side-effect interpretation.

Canonical variable behavior does not establish equivalence between `db_MiscVisualEffectsStatus` and the entire compiled `.sbss` target. Accordingly, all six section-target facts and its game-concept relationship are explicitly unresolved. In particular, this packet does not publish the previously rejected unconditional section-target game-mapping write. It makes no claim about compiled section size, membership, padding, or additional payload. Source-level knowledge remains supported without that attribution.

All four subjects, sixteen facts, and three links have explicit dispositions. A fresh independent review of this repaired packet remains required before application.

Status: synthesized; independent review and live promotion pending.
