## Giant Punch lifecycle

The canonical implementation provides paired grounded and aerial Start, Loop, Cancel, ordinary-release and Full-release callbacks, plus entry and effect-cleanup routines. The header declares the public callbacks; rendered names were treated as hypotheses rather than independent evidence.

### Charge and entry
Entry tests stored charge `fp->u.dk.x222C` for **exact equality** with the configured maximum. Equality selects Full release, copies charge into move-local `xC`, clears persistent charge and primes effect stage `x8` to 1. Every non-equal value selects startup, initializes release charge to zero and leaves persistent charge available. Both entries reset command variables, cancellation/velocity stages and cached-damage sentinels. Ground entry additionally calls `ftCommon_8007D7FC` and clears vertical velocity. Startup animation exhaustion selects the corresponding loop. At animation frame zero, loops increment persistent charge, clamp on **>= maximum**, request color animation 57 and exit charging. These comparisons do not establish a fixed numeric maximum.

### Release and cancellation
Loop IASA tests canonical `pressed_buttons`. B selects ordinary release, transfers and consumes persistent charge, restores callbacks and invokes animation initialization. LR independently latches cancellation; frame zero plus the latch selects Cancel. These are sequential independent branches, so cancellation may follow release during one invocation. Ground loop processing is additionally gated by `ftCo_8009917C`. Other IASA callbacks are empty: this establishes no local input interrupts, not immunity to external interruption.

### Attack updates and recovery
Release animation callbacks consume an effect stage using 0/1/2 values and select effect 1225 in air or 1224 otherwise. Full entry already primes stage 1, so its effect does not require a preceding command-variable trigger. Ordinary releases cache the two hitboxes' base damage using -1 sentinels and apply base plus move-local charge times damage-per-swing. Both updates share the hitbox-zero activity guard; hitbox one is not separately checked. Full releases omit this damage scaling.

Only grounded release callbacks use the velocity stage and `updateVelocity`, which writes facing direction times configured horizontal velocity times move-local charge to ground velocity. Stage changes precede the effect and velocity calls. Release completion clears persistent charge and temporary callbacks. Aerial completion enters ordinary Fall when configured landing lag is zero; otherwise it calls `ftCo_80096900` with that lag. Cancel completion itself does not clear charge, although a preceding independent B-release branch may already have consumed it.

### Physics and collision
Ground physics delegates to `ft_80084F3C`, which selects ground friction, multiplies it above maximum walking speed and applies friction followed by ground movement. Multiplication alone does not establish stronger friction. Air physics delegates to `ft_80084EEC`, applying common falling and aerial friction without local move-state transitions.

Collision callbacks preserve the corresponding phase across ground/air conversion and reinstall callbacks. Ground Start/Loop/Cancel use a false `ft_80082708` result; grounded releases use zero from `ft_800827A0`. Aerial Start/Loop/Cancel require `ft_80081D0C == 1`, whereas aerial releases accept any truthy result. Cancel-family and release-family transition flags remain distinct.

### Cross-file cleanup lifetime
`setCallbacks` installs the shared Donkey damage/death dispatcher, secondary-damage effect cleanup and effect-hitlag callbacks. `clearCallbacks` clears only secondary damage and the two hitlag slots; it does not clear primary damage or death callbacks. The cross-file dispatcher calls neutral-special Plus cleanup and up-special cleanup. Ordinary cleanup forwards the owner to `efLib_DestroyAll`; Plus first clears persistent charge. The effect library synchronously clears matching owner references, traverses both effect lists, performs applicable JObj cleanup and unlinks matching effects. No deferred expiry is introduced by these wrappers.

### Evidence limits
All owned canonical and rendered pages and all frozen subject/link pages were examined. Rendered pages reported no parse errors. No compiled artifacts were supplied, so `.sdata2` composition, ownership and consumers remain unresolved. Input-producer semantics, comparative animation timing, the asserted eight-frame cancel duration, comparative aerial damage and friction-multiplier magnitude remain unproved by the inspected evidence.

Status: synthesized; independent review and live promotion pending.
