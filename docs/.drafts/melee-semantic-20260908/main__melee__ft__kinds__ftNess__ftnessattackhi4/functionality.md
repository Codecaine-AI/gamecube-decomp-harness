## Functionality

This unit implements Ness's up-smash startup, charge and release callbacks, together with yo-yo helpers reused by down smash. The header declarations match the implementation. All owned canonical and rendered pages, all 77 subjects, all 184 baseline facts and all 94 links were reviewed; the final coverage check reported no missing ranges or offsets.

Startup initializes the move-local yo-yo counter to 1, clears script commands and rehit state, enables slope-adjusted positioning, and installs damage and accessory callbacks. Animation increments the counter before running the article controller. The controller spawns at counter 2; charge entry is considered at counter 13 only if charging remains enabled, the fighter-to-yo-yo sweep is clear, and a vertical probe reports floor support. Releasing A during startup latches charging off for that move instance.

Charge entry selects the charge motion at animation frame 12, performs animation setup, freezes playback, and resets the independent yo-yo counter through ApplySmash. That helper preserves numeric smash state 4, initializes hold bookkeeping, and conditionally sends attribute-derived, facing-adjusted velocity to the article. Charge animation advances progress, updates a fighter-side texture-animation control value when the article exists, services the guarded rehit countdown, and requests release at the configured duration. Charge IASA requests release when A is not held.

Release entry selects animation frame 13 and sets the independent counter to 14. Article positioning and spin setup are nullable; sound, damage-helper invocation and callback installation are unconditional. Actual damage modification requires nonzero charge and an enabled first capsule. The multiplier literal is exactly `0.0039059999398887157f`, not exactly 1/256. SetChargeDamage explicitly casts its result to `u32`; the private ApplyDamage helper does not.

Position helpers derive a joint-61 world-space anchor, optionally rotating its offset around FtPart_XRotN using the floor normal. The output-only GetHitPos hypothesis and the interpolated-setter hypothesis fit their distinct canonical behavior. Up-smash release physics blends against the previously stored position using a clamped 0.1-per-counter weight before counter 24, then copies the target directly. The shared interpolation helper itself is unclamped; down-smash release supplies a clamped 0.2 ramp before counter 19. Position publication requires a non-disabled first capsule and nonzero cached X or Y; Z alone does not permit publication.

The article controller selects terminal counter 49 for the up-smash motion range and 60 otherwise. Its active interval assumes a valid article. Script commands control spin presentation; rotation takes precedence over a coincident nudge milestone. Its Boolean result is true only after scheduled creation fails, not after ordinary timed removal. Consequently, normal despawn does not itself suppress the caller's remaining timer and animation-end processing.

Creation stores the returned article in both fighter references, preserves existing damage/death callbacks, and installs hitlag callbacks even when creation fails. Removal has a cross-file lifetime: the item calls the fighter owner-notification helper before clearing ownership and deleting linked objects. That notification invokes guarded post-hitlag restoration and clears the fighter yo-yo association. Collision callbacks therefore recheck the pointer after removal; their secondary item call is flag restoration, not another deletion.

## Semantic assessment

Supported baseline knowledge is explicitly retained in the checkpoint. Corrections address the current held-button field, the controller's spawn-failure return semantics, and post-hitlag restoration versus teardown. A precise ExitHitlag name and purpose are proposed for the unnamed paired wrapper. Existing rendered names were assessed against canonical behavior rather than treated as evidence themselves.

The documentation retains a historical `@file` path, speculative comments and a misleading down-smash comment on the private helper used by up-smash release. These comments do not override canonical callers. No compiled section membership, payload ordering or layout is certified from source declarations.

Status: synthesized; independent review and live promotion pending.
