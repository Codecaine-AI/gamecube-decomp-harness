## Samus inline callback and cleanup helpers

This header defines four static inline helpers:

- `ftSamus_updateDamageDeathCBs` installs `ftSs_Init_80128428` into both `take_dmg_cb` and `death2_cb`. It does not explicitly guard against a null object. The rendered name `ftSs_Init_OnDamage` fits the damage-callback assignment, but this header also establishes a death-callback role; the rendered name alone does not prove the callee's behavior. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/inlines.h#L17-L22)
- `ftSamus_SetAttrx2334` unconditionally clears `fp->u.ss.x2234`, despite the different numeric suffix in its name. It neither destroys effects nor clears the item pointer. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/inlines.h#L24-L29)
- `ftSamus_destroyAllEF` tolerates a null object. For a non-null object, it calls `efLib_DestroyAll` only when `x2234` is nonzero, then clears that field. Thus its broad name describes a conditional operation, not unconditional cleanup. The code tests nonzero rather than a particular numeric state. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/inlines.h#L31-L40)
- `ftSamus_UnkAndDestroyAllEF` also tolerates a null object. If `x222C` contains an item pointer, it passes that pointer to `it_802B5974` and then clears the stored pointer. It subsequently invokes the conditional effect-cleanup helper, including when the item pointer was already null. This establishes local cleanup ordering, but not the item callee's exact behavior or the pointer's complete cross-file lifetime. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/inlines.h#L42-L53)

All 56 canonical and rendered lines were reviewed. Rendering reported no parse errors and substituted the callback name at two assignment sites. There are no owned subjects, baseline facts, or baseline links to disposition. No KB changes are proposed; the helper-name mismatch and external implementation limits are preserved as uncertainties rather than unsupported renames or behavior claims.

Status: synthesized; independent review and live promotion pending.
