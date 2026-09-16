## Kirby copied-Chef pan article

The unit constructs `It_Kind_Kirby_GameWatchChefPan`, attaches a successfully created item to the requested fighter part using its special attributes, and returns NULL without attachment on creation failure. Kirby's caller supplies the left-thumb position and part plus facing direction, stores the result in `u.kb.xDC`, and registers damage/death cleanup only on success. Hitlag and accessory callback assignments occur after the attempt regardless of success.

The sole item-state entry has **state index 0 but animation ID -1**, an animation/lifetime callback, and null physics/collision callbacks. Pickup initialization is owner-guarded. It requests state 0 with `ITEM_ANIM_UPDATE`, but the generic state changer's -1 branch removes model animations and clears the script pointer rather than installing an animation or script. The subsequent animation/frame/script-processing helper is still called.

The lifetime callback returns false while the owning fighter satisfies the inclusive `ftKb_MS_GwSpecialN` through `ftKb_MS_GwSpecialAirN` predicate. Otherwise, including when no owner exists, it invokes the destruction notifier and returns true; generic item dispatch then tears down the item. The notifier itself accesses fighter cleanup only for a non-null owner. It does not validate arbitrary owner pointers or directly destroy the item.

Explicit removal separately checks the resolved Item userdata, invokes notification, and then invokes generic teardown. Fighter notification runs guarded pan exit-hitlag handling before clearing `u.kb.xDC`. The fighter's explicit-removal caller subsequently invokes that cleanup again; the cleared pointer prevents a second pan exit-hitlag call. The paired item hitlag wrappers contain no local null guards and forward unchanged arguments; the fighter callers guard the tracked pan pointer.

The unknown-event callback forwards both arguments unchanged to `it_8026B894`; its exact triggering event remains unspecified.

### Semantic review

Retained the supported Spawn, EnterHitlag, and ExitHitlag names and existing lifecycle knowledge. Corrections distinguish state index from animation ID, preserve the -1 animation branch, replace misleading 'non-returning' terminology, and correct ownerless notification behavior. No compiled section size or literal allocation is asserted. The header renderer reports `shadowed_binding` for the spawn prototype, although the C definition renders the proposed Spawn name; this is a renderer issue, not evidence against the name.

Status: synthesized; independent review and live promotion pending.
