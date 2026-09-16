## Zelda SpecialHi / Farore's Wind

This translation unit implements the move-specific grounded and aerial startup, directional invisible travel, reappearance, physics, effects, and collision transitions. The header declares all 38 public routines; private helpers implement positional startup setup and the aerial grounding guard.

### Startup
- Ground entry zeros ground velocity and self-velocity X/Y, enters motion state **349**, initializes animation, clears `cmd_vars[0]` and `specialhi.xC`, performs joint-derived positional setup, and schedules the startup accessory callback.
- Air entry divides inherited X/Y velocity by attributes `x38`/`x3C`, enters **352**, and performs corresponding initialization. Division is explicit; attenuation and nonzero divisors are not locally guaranteed.
- Startup animation exhaustion invokes grounded or aerial launch selection. Ground physics delegates to `ft_80084F3C`; air physics passes `x40`/`x44` to `ftCommon_Fall`, then calls `ftCommon_8007CEF4`.
- Startup surface transitions preserve progress using `transition_flags1` and rearm the startup effect wrapper. Aerial ground conversion takes priority over common cliff handling.

### Direction selection and travel
Ground launch computes stick magnitude using reciprocal-square-root refinement and clamps it to 1. Its accepted path requires the source's negated-less-than magnitude and floor-angle tests and a false result from `ftCo_8009A134`. For ordinary finite inputs these mean magnitude at least `x50` and angle at least π/2. Success computes ground velocity from `x54`, `x58`, input angle, and facing. Otherwise it converts to air and invokes aerial launch.

Aerial launch uses stick direction only when magnitude is **strictly greater than `x50`**. The other branch, including equality, selects a unit upward vector. In the stick branch, facing updates only when absolute horizontal input exceeds 0.001. Both launches enter travel at frame 35, pause animation, initialize `specialhi.x0` from `x48`, exhaust jumps, set `x2223_b4`, call `ftColl_8007B62C(gobj, 2)`, and enable invisibility. These numeric collision settings are preserved without claiming an independently verified enum meaning.

Travel states are **350 grounded / 353 aerial**. Animation callbacks decrement the timer and enter reappearance when the updated value is nonpositive. Ground travel physics calls `ftCommon_ApplyGroundMovement`; aerial travel physics is empty. All six IASA callbacks are empty, proving only the absence of interruption through those callbacks.

Ground travel collision distinguishes ground support and side-wall contact: loss of ground without a wall continues aerial travel; a wall selects grounded or aerial reappearance according to the ground result. Aerial collision increments `specialhi.xC`; accepted ground contact converts to grounded travel when the counter reaches `x4C`, or earlier when `ftCo_8009A134` does not veto it. Otherwise cliff handling precedes shared teleport collision processing with `x60` and the aerial reappearance callback. Travel surface conversions retain animation frame and invisibility rather than restarting the move.

### Reappearance and aftermath
Reappearance entries select **351 grounded / 354 aerial**. Importantly, velocity snapshots occur **after** motion-state change and animation initialization. They save self-velocity X/Y and ground velocity, clear live velocities, restore visibility, schedule the ending effect, and then restore `x64`-scaled ground or aerial momentum. A reduction is intended by existing descriptions but no local range constraint on `x64` proves it for every possible attribute value.

Ground ending animation exhaustion delegates to `ft_8008A2BC`; the baseline's exceptional common-state caveat is preserved rather than asserting an unconditional Wait transition. Aerial exhaustion requests `ftCo_80096900(gobj, 1, 0, 1, x68, x6C)`. Aerial landing requests `LandingFallSpecial(false, x6C)` before cliff handling. Ending ground loss transfers to state 354 at the current frame with `transition_flags0` and playback rate 1, distinct from the invisible travel conversion.

Aerial ending physics uses `cmd_vars[0]`: zero subtracts one tenth of current vertical velocity and invokes common aerial adjustment; nonzero invokes basic falling and an `x5C * air_drift_max` horizontal clamp. The writer and timing of the nonzero command value are external to this unit.

### Effects and lifetime boundaries
The startup wrapper invokes a helper and clears `accessory4_cb`. The helper guards effect 1270/1271 creation with `x2219_b0`, selects the variant from ground/air situation, and always installs effect hitlag callbacks. The end callback always computes HipN position, guards effect 1285 creation with the same latch, installs hitlag callbacks, and clears its slot. Rearming a callback does not itself guarantee another spawn: latch reset, motion-transition cleanup, collision-state restoration, and exceptional exits depend on external framework lifetimes.

Canonical evidence: [startup and effects](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialhi.c#L31-L227), [travel callbacks and conversions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialhi.c#L229-L357), [launch selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialhi.c#L359-L536), [ending and reappearance](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialhi.c#L538-L668), [public declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialhi.h#L1-L46).

Rendered names were reviewed as hypotheses, not evidence of original spelling. The two proposed `ftZd_SpecialHi_GroundToAir` names collide despite representing different phases. No compiled artifacts were available, so source literals do not establish `.sdata2` allocation or layout.

Status: synthesized; independent review and live promotion pending.
