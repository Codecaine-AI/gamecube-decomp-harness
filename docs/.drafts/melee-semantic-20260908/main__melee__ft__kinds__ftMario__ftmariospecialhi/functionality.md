## Mario SpecialHi

This translation unit supplies eleven grounded/aerial entry, animation, input, physics, collision, and landing callbacks for Mario's SpecialHi family, mapped by the frozen baseline to Super Jump Punch. The header declares all eleven as `void(HSD_GObj*)` callbacks. [Declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialhi.h#L6-L16)

### Entry and completion
Both entries clear `cmd_vars[0]` and `throw_flags`, select their respective symbolic motion states with arguments `(0, 0, 1, 0, NULL)`, and call `ftAnim_8006EBA4`. Aerial entry additionally zeros vertical self-velocity and multiplies existing horizontal self-velocity by `specialhi.vel_x`; grounded entry has no corresponding direct velocity writes. Neither entry explicitly resets `lstick_angle`. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialhi.c#L22-L46)

The shared animation callback calls `ftCo_80096900` only when no frames remain, passing `(0, 1, 0)` and the move's `freefall_mobility` and `landing_lag`. The aerial animation callback delegates unchanged. This is the baseline special-fall handoff; the complete common-state lifetime is outside this file. [Completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialhi.c#L48-L68)

### Input
While `cmd_vars[0] == 0`, horizontal stick magnitude strictly above `momentum_stick_range` produces an angle proportional to `(magnitude - threshold) / (1 - threshold)`. Its radian sign is opposite positive horizontal input. The stored angle changes only when the candidate's absolute magnitude is strictly greater. There is no local clamp or denominator guard. Separately, `ftCheckThrowB3` gates reversal-threshold testing; accepted input updates facing and part 0's Y rotation to `M_PI_2 * facing_dir`. This branch is independent of the command-variable steering gate. Aerial IASA delegates to the same routine. [Input](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialhi.c#L70-L100)

### Physics
The grounded-state physics callback dynamically tests the actual environment: `GA_Air` calls `ft_80085154`, every other value calls `ft_80084FA8`. Aerial physics instead tests the command variable. Any nonzero value calls `ft_80085154` and then scales all three self-velocity components by `specialhi.vel_mul`; zero calls `ftCommon_Fall` with move gravity and common terminal velocity, followed by `ftCommon_8007CF58`. The callback does not write the phase selector. No multiplier value or precise script activation frame is established here. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialhi.c#L102-L127)

### Collision and landing
Both collision callbacks use shared dispatch. Non-air values call `ft_80084104`. In air, a zero command variable or nonnegative vertical velocity calls `ft_80083B68`; otherwise `ft_800831CC` receives `ftCo_80096CC8` and `ftMr_SpecialHi_CheckLanding`. For ordinary finite velocities, that latter branch means nonzero command state and descent; strictly, it is the else branch of the stated comparison, not a separate `< 0` test. Selecting callbacks does not guarantee a landing that frame. The move-specific callback itself performs no collision test and unconditionally forwards `false` and `specialhi.landing_lag` to `ftCo_LandingFallSpecial_Enter`. It can be selected during the move, without the animation-completion handoff occurring first. [Collision and landing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialhi.c#L129-L153)

### Evidence boundaries
Canonical and rendered views were reviewed completely. Rendered substitutions for common animation, physics, collision, and fall helpers remain hypotheses, not independent proof of their internals. No compiled artifact was supplied, so `.sdata2` size, contents, placement, and consumer attribution remain unresolved. Existing broad player-facing move associations are retained from the baseline; a fixed 30-frame landing duration is not established by the source's attribute forwarding.

Status: synthesized; independent review and live promotion pending.
