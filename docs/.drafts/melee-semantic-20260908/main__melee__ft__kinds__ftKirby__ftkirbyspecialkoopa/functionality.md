# Kirby copied Koopa-family neutral special

The owned file implements Kirby's copied Fire Breath for Koopa and Giga Koopa hat kinds: shared emission and resource helpers, ground/air entry routines, and startup, sustained, and ending animation/IASA/physics/collision callbacks. Canonical and rendered source were read through all 558 lines; rendered names were treated as hypotheses, not independent evidence.

## Entry and phase progression

The two entry routines select Kp startup by default and Gk startup for `FTKIND_GKOOPS`, change motion at frame zero with rate one, and initialize move-local state. They clear `x0[0]`, `x0[3]`, `x14`, and `x18`, store `Item_8026AE60()` in `x0[1]`, initialize prior graphics selection `x0[2]` to -1, and set `x10` to one. They do not refill persistent `u.kb.x84/x88`. Startup animation completion enters the corresponding sustained ground/air state. The four startup/ending IASA callbacks are empty.

The sustained animation callbacks decrement and clamp `x10` only when the current animation frame equals zero. They request `Camera_RequestQuake(QuakeKind_Small, &fp->cur_pos)` when `x18` begins at zero, then increment it modulo the configured screen-shake frequency. No local zero-divisor guard exists.

The sustained IASA callbacks initially allow emission without checking B. Once the elapsed counter reaches its configured threshold, held B or nonzero `x10` permits continued emission; otherwise the appropriate Kp/Gk ending state is entered. Emission is requested when `x0[0]` is zero. The common tail still executes after the ending-state transition: it cycles the cadence through 0–2, subtracts one from persistent fuel/speed and scale controls with configured lower clamps, and saturates the elapsed counter at its threshold.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialkoopa.c#L132-L389

## Flame producer and item lifetime

The producer transforms offset `(0, 0.5, 3)` through joint 12, adds scaled breath offsets, and samples a 96-entry table. Previous graphics values 1/2 force sampling from the middle region; other values, including initial -1, first randomly select between the middle and last regions. The result is retained for the next emission. This is graphics selection, not trajectory selection.

The producer requests a Kirby KoopaFlame with the current item-helper value and persistent controls. After the request, phase zero refreshes that value and calls two fighter helpers. Every third emission phase selects one of three sounds using normalized scale thresholds 0.3333 and 0.6666. The phase advances modulo 12. Item allocation can fail, but the producer does not test the returned object before performing its bookkeeping.

Independent item code normalizes supplied speed and scale using the two Kirby accessors, randomizes speed and angle separately, retains the graphics selector, and later uses it for effect selection. The item owns its subsequent lifetime, hitbox scaling, graphics, movement, and collision processing; ending the fighter move is not shown here to destroy all previously emitted items.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialkoopa.c#L19-L90; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itkoopaflame.c#L105-L335

## Recharge and queries

Recharge is guarded by the literal test `motion_id >= 449 || motion_id < 443`. Outside that interval, the two persistent controls independently increase by their recharge attributes and clamp at their maxima. The action table labels Kp phases 443–448, but those action-state labels alone do not establish that every runtime `motion_id` uses the same numeric domain. The guard must not be generalized to all Kp/Gk copied-breath activity without tracing the runtime assignment and upkeep caller.

The two read-only accessors return `int`, check both the game object and Fighter pointer, and return configured maximum fuel/scale or fallback 1/2. They do not validate `dat_attrs` or guarantee that a valid configured denominator is nonzero.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialkoopa.c#L92-L130; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirby.c#L1168-L1234

## Physics, collision, and completion

Ground physics delegates to `ft_80084F3C`, whose canonical implementation applies ground friction, scales it above walking speed, and advances grounded movement. Air physics delegates to `ft_80084DB0`, which checks fast fall, applies fast-fall or ordinary gravity, and performs common aerial movement.

Collision callbacks preserve the current animation frame and choose Kp/Gk destinations from hat kind. Ground callbacks test `ft_80082708(gobj) == GA_Ground`; air callbacks test `ft_80081D0C(gobj) != GA_Ground`. These comparisons are preserved literally rather than inferred from rendered helper names. Active transitions use flags `0x0C4C5880`; startup/ending transitions use `0x0C4C5080`. Crucially, aerial startup landing enters grounded sustained `KpSpecialN`/`GkSpecialN`, not grounded startup. The transition family is therefore not universally phase-symmetric.

Ground ending animation completion calls the common action-ending dispatcher, normally reaching Wait subject to its exceptional guards. Aerial ending completion calls Fall entry, whose ordinary path preserves fast fall, clamps drift, and initializes Fall variables, also subject to common exceptional handling.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialkoopa.c#L391-L557; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L54-L109; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L47-L71

## Evidence limits

Source proves the table declaration and scalar literal uses, not compiled section membership, pool ordering, or byte extents. No compiled artifacts were supplied. Historical helper names, inferred field roles, and rendered semantic substitutions are not proof of original spelling or ABI/layout.

Status: synthesized; independent review and live promotion pending.
