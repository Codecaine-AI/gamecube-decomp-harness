## Samus grounded-grab Grapple Beam helpers

This translation unit contains two timer-driven article handlers and two cleanup helpers. Canonical Catch callers establish standing versus dash-grab context independently of rendered names: `ftCo_Catch_Anim` short-circuits on `fn_800D9558`, and `ftCo_CatchDash_Anim` short-circuits on `fn_800D9930` (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Catch.c#L118-L141).

### Timed article handling
Both handlers return false without modifying non-Samus fighters. For Samus, they increment the floating field `fp->mv.ca.specials.grav` by one per invocation; its use here is a timer, not evidence of gravitational acceleration. At the creation threshold they obtain bone 51's position, store the spawned article in `fp->u.ss.x223C`, and install `accessory2_cb`, `death1_cb`, and `accessory3_cb`. Failed creation calls `ft_8008A2BC` and returns true.

The standing variant uses creation threshold `x9C`, deployment `xA0`, later phase `xA4`, and removal `xA8`. Within the post-creation window, timer values 20, 23, 26, 29, 32, and 35 can emit effect `0x3F3` at the first segment object's matrix translation plus independent coordinate offsets `4 * (HSD_Randf() - 0.5)`. Deployment first tests a horizontal stage-geometry segment at bone 51's height, from the fighter collision x-coordinate toward the joint x-coordinate plus `2 * facing_dir * scale.y`. A hit removes the article, invokes the failure dispatcher, and returns true; otherwise velocity is `(article_attribute_x40 * facing_dir, 0, 0)` (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0D95.c#L12-L97).

The dash variant uses `xAC`, `xB0`, `xB4`, and `xB8`, with possible effects only at 20, 23, 26, and 29. It has no corresponding obstruction test. Its velocity starts from the source-level constant vector `{1, 0, 0}`, then replaces and signs x using the article attribute (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0D95.c#L99-L170).

These are exact floating equality checkpoints, not catch-up transitions. Creation takes precedence over subsequent phases; deployment, phase-change, and removal are an ordered else-if ladder inside the bounded post-creation window. Attribute values and ordering are not established here. Both handlers dereference the tracked article and its attributes before their later `item != NULL` test, so that test does not provide general missing-article safety.

### Cleanup and cross-file lifetime
`fn_800D9C64` has only a Samus-kind guard and delegates the tracked pointer, including NULL, to `it_802B7B84`. Both grounded Catch collision callbacks share a path that invokes this helper before Fall. `ftCo_800D9C98` instead has no kind guard: it conditionally delegates article removal and explicitly nulls the handle, then unconditionally clears `death2_cb`, `take_dmg_2_cb`, and `take_dmg_cb` (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0D95.c#L172-L193; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Catch.c#L163-L179).

The item-side remover performs teardown only when article, Item state, stored owner, and owner Fighter are non-NULL. It clears the item update hook, owner handle, accessory callbacks and primary death callback, destroys the linked segment GObjs, then requests article removal. These are nested null checks, not reciprocal-owner equality validation; failed guards skip teardown (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsamusgrapple.c#L418-L444).

Samus's aggregate cleanup invokes `ftCo_800D9C98` after neutral- and side-special cleanup. Canonical inline code registers that aggregate routine for primary damage and secondary death, independently supporting interruption semantics without relying on archived discussion (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamus.c#L287-L292; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/inlines.h#L17-L22).

### Evidence boundaries
Rendered names remain descriptive hypotheses, not original-symbol proof. The owned canonical and rendered file was reviewed completely, including includes, signatures, stack-padding declarations, the constant vector, and all branches. No compiled artifacts were supplied, so no section placement, size, layout, or register-allocation claims are made.

Status: synthesized; independent review and live promotion pending.
