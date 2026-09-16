## Shared side-special implementation

This unit implements Captain Falcon's Raptor Boost and Ganondorf's Gerudo Dragon: grounded and aerial startup entry, contact-triggered connected states, animation completion, physics, collision recovery, and effect cleanup. The header declares the 20 public callbacks; the documentation describes the same shared suite.

### Startup and contact
Both entry paths clear all four command variables, select the corresponding startup motion, initialize animation, install damage/secondary-death cleanup and hurtbox-detection callbacks, select character-specific startup effects, and clear self velocity. Ground entry also clears ground velocity; air entry clears the move-local gravity accumulator. Callback installation is not equivalent to unconditional detection activation: the detector requires cmd_vars[0] != 0. Animation initialization occurs after the explicit command reset, so this unit alone does not establish the command values after all delegated initialization.

Eligible contact means a fighter, or an item satisfying the exact source predicates: kind below It_Kind_BombHei, in [It_Kind_Kuriboh, It_Kind_Octarock_Stone), in [It_Kind_Old_Kuri, It_Kind_Arwing_Laser), or equal to It_PKind_Random. Only the two startup motion IDs dispatch to connected states. The detector applies no direct damage. Ground contact transition clears vertical/depth velocity and scales ground velocity; aerial transition clears depth velocity. Transition flags retain graphics and selectively preserve other state.

### Animation and movement
Connected animations create character-specific effects under during_specials. Captain/Ganon branches set that latch; the default fighter-kind branch does not. Grounded animation completion delegates to common neutral handling, whose exceptional branches prevent an unconditional Wait interpretation. Aerial completion selects ordinary Fall for zero configured lag and the common special-fall path otherwise, using distinct hit/miss attributes.

All four IASA callbacks are empty. Both grounded physics callbacks delegate to common friction/animation-translation movement. Aerial physics first copies animation-derived horizontal and vertical velocity through ft_80085134. Startup then overrides vertical velocity with its gravity accumulator only when cmd_vars[1] == 1 on that tick; connected physics always performs that override. The accumulator is decremented by specials_grav and lower-clamped to -specials_terminal_vel. Monotonic downward progression presumes appropriate attribute signs and is not a property of arbitrary configurations.

### Collision and effect lifetime
Ground startup uses generic collision handling when cmd_vars[2] == 0. Otherwise, loss of ground destroys effects and selects miss recovery; drift clamping occurs only on the nonzero-lag branch. With ground retained, wall cancellation additionally requires cmd_vars[0] == 1 and the exact facing/mask pairing in source. Connected ground loss follows analogous hit-lag recovery. Aerial landing destroys effects and forwards hit/miss lag to LandingFallSpecial; the connected landing callback first copies self_vel.x to gr_vel.

RemoveGFX destroys fighter-owned managed effects and resets both effect latches. The cross-file ftCa_Init_800E28C8 wrapper reaches it from installed damage and secondary-death slots. Direct collision calls to efLib_DestroyAll do not themselves explicitly reset those two latches. These paths must not be conflated.

### Semantic review
The hash-bound research establishes complete canonical/rendered coverage and assessment of all 42 subjects, 108 facts, and 59 links. This distinct lead independently read the complete canonical/rendered C file, including lines 241–419 missing from the rejected attempt, and reconciled every proposed citation and upstream non-retain disposition. Supported baseline knowledge is explicitly retained through the inherited ledger; three compiled .sdata2 claims remain unresolved, and the unit-level detection-enabled explanation is corrected. Existing owned callback names fit their implementations and need no cosmetic rewrite. Rendered foreign names remain hypotheses rather than independent proof; supporting cross-file research and its accepted deferrals are inherited. The documentation's grounded-entry/aerial-physics mislabels are source-documentation defects, not renderer substitutions.

Status: synthesized; independent review and live promotion pending.
