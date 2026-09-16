## Master Hand damage and sweep callbacks

This unit supplies Damage IASA/physics/collision callbacks and the WaitSweep → SweepLoop → SweepWait entry sequence. All functions take `HSD_GObj*` and return void. The header declares the public callbacks and entry helpers; `ftMh_MS_347_80151AC8` is static and absent from the header.

### Damage and IASA

Damage physics unconditionally adds special attributes `x150` and `x158` to `self_vel.y` and `self_vel.z`, respectively; it does not change x velocity or perform a transition. Damage collision is empty. Damage, WaitSweep and SweepLoop IASA callbacks call `ftBossLib_8015BD20` only when the player's slot type is zero. `Gm_PKind_Human` is zero, and the canonical hook immediately returns, so these dispatches presently have no fighter-state effect. The rendered CrazyHand-specific hook name is not evidence of exclusive character ownership.

Evidence: [Damage callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsweep.c#L15-L31), [slot enum](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/forward.h#L11-L17), [empty hook](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34).

### Sweep progression

`ftMh_MS_344_80151828` enters `ftMh_MS_WaitSweep` and calls `ftAnim_8006EBA4`. WaitSweep animation invokes `ftMh_MS_346_80151918` only after frames are exhausted. That helper stores `(cur_pos.x - x3C, x38, 0)` in `mv.mh.unk0.xC`, enters `ftMh_MS_SweepLoop`, and performs the same animation follow-up. These canonical destinations independently support the proposed WaitSweep_Enter and SweepLoop_Enter names; the numeric-looking original symbol components are not used to infer state numbers.

At SweepLoop animation completion, `mpFloorGetLeft(0, &pos)` supplies the boundary. A strict `cur_pos.x < pos.x` comparison enters SweepWait through the static helper and returns before target refresh. Equality takes the repetition path. Otherwise the target is recomputed from the current position and attributes, and SweepLoop restarts. While frames remain, neither boundary query nor refresh occurs. Every local state-change call uses the same trailing arguments `(0, 0, 1, 0, 0)`. Leftward target displacement presumes positive `x3C`; its runtime sign is not established here. Both sweep collision callbacks are empty.

Evidence: [preparation and target initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsweep.c#L33-L70), [loop branches and terminal entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsweep.c#L74-L121).

### Movement and cross-file data lifetime

WaitSweep physics delegates to `ft_80085134`, which replaces x velocity with animation translation z multiplied by facing direction and y velocity with animation translation y. SweepLoop physics passes the stored target by address, `x18` by address, and `x2C`/`x28` by value to `ftBossLib_8015BE40`. The target connects entry/repetition initialization to later physics processing. `x18` is a scalar output, not a second vector.

The boss helper computes a three-dimensional target-position difference and distance. Below the `x2C` threshold it writes zero to `x18` but leaves the difference unscaled; otherwise it writes the distance and normalizes/scales the difference by distance times `x28`. Both branches assign only x/y self velocity. Thus zero distance output does not imply zero velocity, and z contributes to distance without being assigned to self velocity. No local SweepWait-entry cleanup of these fields is explicit; later SweepWait processing is outside the owned unit.

Evidence: [physics call](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsweep.c#L107-L113), [animation-derived velocity](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125), [movement helper branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L57-L80).

### Evidence boundaries

Both owned canonical and rendered files were read completely. Rendering reported no parse errors; substitutions are hypotheses, not independent proof. No compiled artifact was supplied, so `.sdata2` size, ordering and literal-to-pool attribution remain unresolved. Floor Sweep is retained as the descriptive sweep-family mapping, without independently asserting the `harau` alias, damage values, or debug-menu development history.

Status: synthesized; independent review and live promotion pending.
