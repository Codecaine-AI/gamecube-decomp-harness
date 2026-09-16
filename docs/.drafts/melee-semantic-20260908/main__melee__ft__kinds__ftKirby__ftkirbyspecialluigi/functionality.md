## Kirby's copied Luigi neutral special

The unit implements paired grounded and aerial entry routines, animation/IASA/physics/collision callbacks, and a shared accessory release callback.

- Entries clear `cmd_vars[0]` and `throw_flags`, enter the appropriate copied-Luigi motion state with frame 0, playback rate 1 and zero blend, perform animation setup, and install `fn_800F98F4` in `accessory4_cb`.
- Animation exhaustion dispatches grounded neutral handling or aerial Fall. Grounded neutral handling is not an unconditional direct Wait transition: the downstream dispatcher retains exceptional branches.
- Nonzero command-variable slot 0 enables common grounded or airborne input processing. The callbacks read this slot without clearing it; eligible transitions use first-success dispatch, and enabling processing does not guarantee an interrupt.
- Ground physics delegates to friction and movement processing, including increased friction scaling strictly above maximum walk speed. Air physics checks fast-fall activation, chooses fast-fall velocity or gravity/terminal-velocity processing, and then applies aerial drift.
- Collision callbacks conditionally continue the move in the opposite kinetic form using the current animation frame and restore the accessory callback. The literal predicates are `ft_80082708(gobj) == GA_Ground` and `ft_80081D0C(gobj) != GA_Ground`. Enum and local-variable names must not be treated as independent proof of physical contact polarity. Four existing grounded-collision explanations remain explicitly unresolved.
- `fn_800F98F4` consumes throw-B0 before calculating the left-hand position, requesting `It_Kind_Kirby_LuigiFire`, and requesting effect `0x4B1`. The item constructor returns void and internally checks whether allocation succeeded. The effect request follows regardless of item allocation success. Callback restoration does not itself raise another release event. The item subsystem owns subsequent projectile initialization, lifetime and updates; the local position is copied into the constructor request rather than retained as a stack pointer.

## Semantic review

The rendered entry names and `ftKb_LgSpecialN_FireSpawn` fit independently inspected canonical behavior and are retained without cosmetic rewrites. Shared physics names fit the callee implementations reviewed upstream. Rendered collision names do not resolve return-value polarity. Rendering completed without parse errors; its substitutions cover function names only. No compiled section/layout claim is made for `.sdata2`.

Complete coverage of all 24 subjects, 58 facts and 43 links is inherited from the hash-bound research handoff. The lead independently inspected the owned canonical/rendered file and every proposed-fact and contradiction citation. The inherited ledger retains 53 facts and all 43 links, supersedes one fact, and defers four facts; no disposition overrides are needed. The proposed correction distinguishes one release-request sequence from guaranteed successful projectile/effect creation and avoids the misleading suggestion that the void item constructor returns a nullable result.

Status: synthesized; independent review and live promotion pending.
