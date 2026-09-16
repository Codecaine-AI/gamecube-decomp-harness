# Mewtwo Teleport

This unit implements grounded and aerial startup, timed invisible travel, and visible ending/recovery callbacks. The header declares the exported callback family; it does not establish compiled addresses or section layout.

## Startup
Grounded startup clears ground velocity and XY self velocity. Aerial startup divides existing XY velocity by separate Teleport attributes. Both enter their startup motion, initialize animation processing, clear `cmd_vars[0]` and `SpecialHi.unk4`, and schedule `ftMt_SpecialHi_CreateGFX`. Startup animation exhaustion dispatches travel selection. Grounded startup does **not** guarantee grounded travel: its travel selector can convert to aerial movement and delegate to aerial entry. Startup ground/air conversions use `transition_flags1` and rearm the startup callback.

## Travel selection and lifetime
Ground travel entry clamps stick magnitude to one, accepts magnitude at the minimum threshold, and additionally requires the floor-angle and `ftCo_8009A134` predicates. Accepted input produces grounded velocity from facing-relative trigonometry. Rejected input takes the aerial path. Aerial entry instead requires magnitude strictly above the minimum; otherwise it chooses a full-strength upward fallback. Both travel entries select Lost at animation frame 35, initialize animation processing, then freeze animation rate. Shared setup initializes the duration counter, marks all jumps used, sets `x2223_b4`, calls `ftColl_8007B62C(gobj, 2)`, enables invisibility, and plays sound `0x30DA1`. Numeric collision mode 2 is not assigned a stronger semantic interpretation here.

Lost animation callbacks decrement `travelFrames` and enter the corresponding visible End state at zero or below. All IASA callbacks are empty. Aerial Lost physics is also empty; grounded Lost physics delegates to common ground movement. Empty callbacks establish only the absence of their own transformations, not immunity to changes elsewhere in the engine.

## Collision branches
Grounded travel distinguishes ordinary ground loss from wall contact. Ground loss without a side wall continues aerial Lost travel; a wall ends travel in grounded or aerial End according to the support result. Aerial travel increments `unk4`, then accepts ground conversion when the timer threshold is reached or the auxiliary predicate does not veto it. If conversion is not taken, cliff handling precedes shared teleport-impact processing, which receives the angle-clamp attribute and aerial End callback. Travel ground/air conversion preserves the current animation frame and invisibility rather than restarting the duration.

## End and recovery
Despite their names, `SpecialHiLost_Enter` and `SpecialAirHiLost_Enter` enter the non-Lost End motions. After motion change and animation initialization, shared setup snapshots live velocities, clears them, restores visibility, and schedules `SetEndGFX`. The entries then restore attribute-scaled ground or aerial momentum. This ordering matters: the snapshot occurs after the common motion-change calls.

Grounded End physics delegates to `ft_80084F3C`; its canonical implementation applies ordinary ground friction or the common-data-scaled friction above walking speed, then ground movement. Aerial End physics branches on `cmd_vars[0]`: zero damps vertical velocity by one tenth and calls the common adjustment helper; nonzero applies basic falling and an attribute-scaled horizontal clamp. Grounded End animation completion calls `ft_8008A2BC`. Aerial completion forwards configured mobility and landing lag to `ftCo_80096900`. Aerial collision prioritizes special-fall landing over cliff handling. Grounded End ground loss continues aerial End at the current frame using `transition_flags0`.

## Presentation and evidence limits
`SetStartGFX` conditionally queries the waist position and spawns effect `0x4E8` under `x2219_b0`; effect hitlag callback setup is unconditional. `CreateGFX` clears its accessory slot after calling that helper. `SetEndGFX` conditionally queries the waist position and sets the latch, installs hitlag callbacks, and clears its slot, but contains **no effect spawn**. Scheduling the end callback must not be described as proof that it creates an effect.

Canonical and rendered pages were reviewed in full. Rendered substitutions are hypotheses, not independent evidence for common-helper semantics. Source arithmetic does not prove the contents, placement, or load relationships of compiled `.sdata2`; its four facts and two links remain unresolved. Cross-file cleanup and script-controlled command changes remain explicit lifetime boundaries.

Status: synthesized; independent review and live promotion pending.
