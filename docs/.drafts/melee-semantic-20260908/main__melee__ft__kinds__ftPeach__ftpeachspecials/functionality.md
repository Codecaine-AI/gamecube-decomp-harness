# Peach side-special semantic review

The owned C file implements grounded and aerial SpecialS entry, startup, aerial launch, contact handling and endings; the header declares the public callback family. Full research coverage is inherited. Independent lead review restored canonical contradiction evidence and reconciled the documentation with the empty proposal. Rendered names remain hypotheses, not proof.

## Entry and startup

Both entry functions register `reset` in `x21EC`, initialize movement, enter startup at frame 0/rate 1 and call `ftAnim_8006EBA4`. Ground entry clears vertical velocity and sets ground velocity to `x34 * facing_dir`; aerial entry sets vertical velocity to `x40`. Reset clears command slots 0–3, horizontal self velocity and horizontal translation offset. The comparison `x673 < x30` sets both `count_thrown_items` and move-local `x0` when true; otherwise only `x0` is cleared. Callback registration does not prove invocation or clearing lifetime.

At startup animation exhaustion, slot 0 chooses ending rather than launch. Ground launch first calls `ftCommon_8007D5D4`, offsets X by `-4 * facing_dir * scale.y` and Y by `3.5 * scale.y`, then enters aerial launch. Startup physics delegates to common movement routines; startup IASA callbacks are empty, not proof of global uninterruptibility. Facing-relative wall obstruction marks slot 0; aerial startup also handles ceilings. Collision checks continue after possible adapter transitions. Startup adapters use `start_mf`; the aerial adapter also clears horizontal self velocity. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachspecials.c#L37-L215)

## Launch and contact

`enterAirJump` selects configured horizontal launch velocity using `x0`, applies facing direction, sets configured vertical velocity, changes motion, reacquires the Fighter and installs `ftCommon_8007F76C` plus `doAirEnd0`. Slot 1 enables air friction and selects gravity; terminal velocity is shared. Slot 3 or animation exhaustion invokes the shared aerial ending, with short-circuit OR evaluation. Launch IASA is empty.

Launch collision first conditionally invokes grounded conversion and ending, then independently checks facing-relative walls. A matching wall sets slot 2 and invokes aerial ending even after the first branch ran. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachspecials.c#L217-L277)

`doAirEnd0` preserves its exceptional guard: with `x221C_b5` set and a non-null associated Fighter, only MARS/EMBLEM motion IDs 369 or 371 and PEACH IDs 365 or 367 pass. Other kinds/motions return; a null associated Fighter does not block the accepted path. The accepted path clears horizontal and nonnegative vertical velocity, marks slot 2 and enters aerial ending. These are intermediate velocity writes, not guaranteed final rebound values. Numeric motion IDs receive no additional gameplay names. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachspecials.c#L77-L110)

## Endings and cross-file lifetime

Ground ending enters `SpecialSEnd` and performs post-end setup. Shared aerial ending divides X/Y velocity by `x68`/`x6C`, chooses `SpecialAirSEnd_1` when slot 2 is nonzero and `_0` otherwise, then performs post-end setup. Neither damping nor input-exclusive Smash behavior follows from this code.

Both post-end helpers conditionally obtain hip-joint position, force Z to zero, attempt explosion spawning with `x0` and facing direction, and replace both velocity components with configured ending values. They unconditionally install `ftCommon_8007F7B4`. Different local array sizes establish no compiled stack layout. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachspecials.c#L334-L395)

Explosion allocation can fail. Success stores the owner, sets life timer 60.0, clears the item command variable and selects item motion 0/1 from the variant. Fighter velocity assignment does not depend on spawn success. Item animation/reference callbacks establish a separate lifetime; eventual destruction remains delegated. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itpeachexplode.c#L26-L74)

Aerial ending animation exhaustion enters Fall. Ground ending exhaustion delegates to common action-ending logic, with ordinary Wait behavior but exceptional paths and Peach parasol handling. Ending IASA callbacks are empty; physics delegates to common ground/air processing. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachspecials.c#L279-L332), [common ending](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109)

## Preserved uncertainties

Peach directly tests `ft_80081D0C` before grounded transitions, although that helper returns `GA_Air` on a true map result and `GA_Ground` otherwise, including its exceptional branch. Peach negates `ft_80082708` before the aerial ending adapter; that helper returns `fall_off_ledge ? GA_Air : GA_Ground`. Preserve exact tests and destinations pending enum/compiled-convention validation rather than silently assigning landing or ground-loss polarity. [First helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123), [second helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L392-L404)

No compiled artifacts establish `.sdata2` size, layout, pool membership or load provenance. Exact input timing, damage, attribute values, command-script producers and engine callback lifetimes remain unproved. Inherited accounting remains 166 facts: 132 retained and 34 unresolved; 61 links: 51 retained and 10 unresolved. No fact or link disposition requires an override.

Status: synthesized; independent review and live promotion pending.
