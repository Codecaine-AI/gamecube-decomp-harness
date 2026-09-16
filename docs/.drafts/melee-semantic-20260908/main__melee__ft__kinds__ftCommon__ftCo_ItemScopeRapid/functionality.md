## Super Scope rapid-fire fighter actions

The implementation contains paired grounded/airborne fresh entries, situation-transition helpers, animation/input/physics/collision callbacks, and a shared rapid-shot accessory callback. The header contains only an include guard.

Fresh entries select the appropriate rapid motion through `fn_800D769C`, start at frame 0 and speed 1 with flags `0x02000000`, initialize `mv.co.common.x0` using an explicit cast of common-data `x5BC`, and install accessory and damage callbacks. Airborne entry also clamps air drift. Situation transitions instead pass the existing animation frame and speed with flags `0x0C4C5080`, reinstall callbacks, and contain no local counter initialization. Ground collision dispatches the airborne transition on a false support result; airborne collision conditionally dispatches the grounded transition.

Both animation callbacks run their cycle processing only when `0 <= cur_anim_frame < frame_speed_mul`. They invoke attack bookkeeping and decrement the counter. An exact-zero result takes priority over ammunition exhaustion and enters the corresponding ending helper. Otherwise, a present exhausted item selects grounded or airborne rapid-empty motion according to the current situation, preserving explicit timing arguments and reinstalling callbacks. A missing item does not itself trigger the empty transition. The counter is not locally saturated; a decrement from zero does not take the exact-zero exit. One decrement occurs per qualifying invocation, not necessarily once per loop under arbitrary scheduling.

IASA tests `input.pressed_buttons & HSD_PAD_A` and copies an `s32` from common-data offset `0x5BC` to Fighter offset `0x2340`. The common motion-variable declaration associates that destination with `common.x0`. This supports input-driven continuation, but does not establish a particular configured duration or guarantee survival of the next cycle boundary.

Physics delegates to shared grounded friction/movement or airborne fast-fall/gravity and aerial movement. The grounded path applies its additional friction multiplier only strictly above maximum walking speed.

The accessory callback does nothing without a held item. Otherwise it requests a shot level using fixed input zero and delegates to `fn_800D84D4`. Actual effects require the downstream item and throw-event guards. Valid levels produce projectile work; other returned levels produce empty feedback. Resource deduction occurs in the item-side projectile path, not in this local callback. The selector returns -1 for nonpositive resource, but positive resource alone does not prove a level-zero result: selection depends on attributes, and an unaffordable level-zero path has no explicit return.

The damage callback is shared with Scope fire and conditionally delegates item handling. Rapid expiration enters the separate Scope ending family, whose animation completion delegates to Scope fire completion handling. Callback installation here therefore does not establish an unlimited lifetime across later states.

## Semantic assessment

Existing rendered entry, landing-transition, and rapid-shot names fit their canonical roles and are retained as hypotheses. The unchanged `fn_800D7D70` can usefully receive a ground-to-air role name. Existing explanations are retained except for obsolete input-field spelling, an unconditional continuation guarantee, and an overbroad positive-resource firing claim. Both distinct grounded-physics concept links remain explicitly retained. No compiled section contents, ABI layout, or `.sdata2` interpretation is asserted.

Status: synthesized; independent review and live promotion pending.
