## Kirby copied Mario-family neutral special

This translation unit implements grounded and aerial startup, animation completion, command-gated interrupts, movement delegation, collision continuation, and deferred projectile release for Kirby's copied Mario/Dr. Mario neutral specials.

### Startup and phase callbacks
- `ftKb_SpecialN_800F9110` clears `cmd_vars[0]` and all throw flags, selects `ftKb_MS_MrSpecialN` for Mario or numeric `0x200` otherwise, enters at frame 0/rate 1, calls `ftAnim_8006EBA4`, and installs `fn_800F9260` as `accessory4_cb`.
- `ftKb_SpecialNMr_800F93CC` performs equivalent aerial startup, explicitly choosing `ftKb_MS_MrSpecialAirN` or `ftKb_MS_DrSpecialAirN`. Neither entry restricts its alternate branch to Dr. Mario specifically.
- Ground animation completion invokes `ft_8008A2BC`; aerial completion invokes `ftCo_Fall_Enter`. These normally resolve to Wait and Fall respectively, but their common implementations contain exceptional branches.
- Both IASA callbacks test `cmd_vars[0] != 0`. Ground delegates to `ftCo_Wait_IASA`; air delegates to `ftCo_Fall_IASA_Inner` and discards its result. Neither locally clears the gate. Exact script opening frames are not established.
- Physics callbacks unconditionally delegate to shared grounded friction/movement and aerial fast-fall/gravity/control routines.

Evidence: [startup and ground phases](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmario.c#L29-L72), [aerial phases](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmario.c#L133-L172).

### Deferred projectile release
`fn_800F9260` skips all processing when the hat kind is `FTKIND_KIRBY`, including throw-bit consumption. Otherwise, `ftCheckThrowB0` tests and clears the pending bit. An accepted event obtains the left-hand joint position. Mario creates `It_Kind_Kirby_MarioFire`, requests effect `0x49F`, and returns. Every other non-Kirby kind takes the vitamin branch; there is no explicit Dr. Mario check.

The inline selector builds candidates from integers 0–8 excluding stored `x68` and `x6C`, randomly selects a candidate, shifts old `x68` into `x6C`, and stores the selection in `x68` before calling `itDrMarioPill_Spawn` with `It_Kind_Kirby_DrMarioVitamin`. The candidate count need not always be seven: stored values can coincide or lie outside the candidate range. These entries do not reset the history fields. Their initialization and lifetime outside this unit remain unverified. The local code does not inspect projectile-constructor success.

Evidence: [selector and callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmario.c#L74-L131), [one-shot event helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L245-L253).

### Situation continuation and numeric ambiguities
Ground collision calls `ftKb_SpecialNLg_800F951C` exactly when `ft_80082708` returns `GA_Ground`. Air collision calls `ftKb_SpecialNLg_800F9598` exactly when `ft_80081D0C` returns something other than `GA_Ground`. Enum names must not be interpreted as direct descriptions of physical contact. In particular, `ft_80082708` maps a locally named `fall_off_ledge` boolean to `GA_Air` when true, leaving its physical interpretation unresolved without the collision primitive.

The first continuation helper establishes airborne handling and chooses numeric motion `0x190` for hat kind zero or `0x201` otherwise. The second establishes grounded handling and chooses `0x18F` or `0x200` on the same literal test. Both pass the current animation frame, flags `0x5000`, rate 1 and blend 0 to `Fighter_ChangeMotionState`, then explicitly restore the projectile callback. Callback restoration does not alone prove survival of an already pending throw bit across the central state-change routine.

The common airborne initializer also resets ground velocity, sets jumps used to one, and locks the collision box. Grounding performs velocity/jump bookkeeping and can assert if no supporting ground is found. Air collision acceptance can be suppressed by `ft_80081A00`; common action completion is not an unconditional Wait/Fall guarantee.

Evidence: [continuation helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmario.c#L167-L216), [ground query](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404), [air query](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123), [situation bookkeeping](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L594).

### Evidence boundaries
All 217 canonical and rendered lines were reviewed in the inherited research. Rendered function names are hypotheses; inherited naming checks used canonical bodies and the independently named native Mario implementation. The lead independently inspected the collision guard, projectile callback, and continuation bodies, together with the shared ground-query implementation, and accepted all five upstream deferrals. The empty proposal is consistent with these evidence boundaries. The inherited renderer reported zero parse errors and 21 substitutions. No compiled artifacts were supplied, so no `.sdata2` contents, placement, size, or layout claims are made. Parameter entities have no baseline facts; their `#r3` locators are not treated as independent compiled ABI evidence.

Status: synthesized; independent review and live promotion pending.
