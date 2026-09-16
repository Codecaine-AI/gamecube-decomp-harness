## Common grounded up tilt

The input predicate requires newly pressed A, left-stick Y at or above attackhi3_stick_threshold_y, and a stick angle strictly greater than x20_radians. The angle helper uses atan2f(y, abs(x)); this is upward stick input, not a requirement to point left. A held item satisfying ftCo_80094E54 takes priority and enters LightThrowHi. Otherwise doEnter clears allow_interrupt, enters AttackHi3 with flags Ft_MF_None and arguments 0, 1, 0, then invokes ftAnim_8006EBA4. Both accepted branches return true; failed guards return false.

Animation completion calls ft_8008A2BC rather than directly entering Wait. Its hand-specific dispatch and ordinary neutral-path exceptions remain significant: DownSpot and another predicate-selected state can precede Wait, with additional airborne, item and character handling. IASA independently gates ftCo_Wait_IASA on allow_interrupt. The animation command ftAction_80071950 enables that flag; the standing dispatcher stops at the first accepted transition. No particular actionable frame is established here.

Physics delegates to ft_80084F3C, which applies character ground friction, conditionally scales it above maximum walking speed, and updates grounded movement. Collision delegates to ft_80084104, which enters Fall when ft_800827A0 returns false. The owned callbacks add no local physics or collision branches. The header declares the five public functions; doEnter remains private through its static forward declaration.

## Semantic assessment

Existing owned function names and source-level explanations remain useful and are retained without equivalent rewrites. Rendered item-throw, physics and collision substitutions agree with independently restored callee source at the level used here. The rendered ftAnim_Advance name is not independently established by these excerpts; the canonical call is preserved without inferring detailed animation advancement. Parameter subjects have no baseline facts. No compiled section layout is inferred from source literals: the three .sdata2 facts remain unresolved pending compiled evidence.

Status: synthesized; independent review and live promotion pending.
