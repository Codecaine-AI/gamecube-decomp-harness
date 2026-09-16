## CatchPull functionality

This unit implements grabber-side pull initialization, completion, grounded physics, collision release, and positional maintenance. All owned canonical and rendered lines were reviewed. Rendered function names remain hypotheses, not independent evidence.

### Entry and attachment lifetime
`fn_800D9CE8` zeros ground velocity and selects destination motion `0xD5` when the source motion is `0xD4`; every other source motion selects `0xD7`. The latter is an unrestricted else branch, not an explicit dash-state validation. The current frame is preserved except for Yoshi's guarded `[x124,x128)` remapping through `x12C`, after the animation-rate/helper calls. Link/CLink and Samus supply joints from their tether items; ordinary fighters use a configured fighter joint. Unlike the animation callback, entry does not null-check those item pointers. It clears throw flags, changes motion with `0x4000`, installs `fn_800DA190`, and clears `x221B_b7`. [Canonical entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchPull.c#L14-L68).

### Completion and state callbacks
For tether users, a null item or nonzero item `x14` triggers `fn_800DA1D8`; an existing item with zero `x14` keeps the pull active. Ordinary fighters transition when animation ends, or consume `throw_flags_b3` while frames remain. An already-ended animation bypasses the flag read/clear. IASA is empty. Physics applies `p_ftCommonData->x64 * ground_friction` before common ground movement. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchPull.c#L70-L138).

The destination helper enters CatchWait, resets velocity, installs new callbacks, and replaces the stored attachment with a fighter skeleton joint; thus the tether attachment must not be treated as persistent throughout holding and pummeling. [CatchWait initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchWait.c#L14-L31).

### Release and positional maintenance
Collision delegates to `ft_800841B8` with `fn_800DA004`. That callback snapshots `victim_gobj`, invokes pair teardown, then calls Fall entry for grabber and victim in that order. The snapshot survives teardown's clearing of both relationship fields. Teardown has conditional placement correction; Fall entry itself has exceptional dispatch and does not universally select ordinary Fall. [Release sequence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchPull.c#L135-L147), [teardown](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureCut.c#L84-L196), [Fall dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L47-L71).

`fn_800DA054` skips positional work when the victim's `x2226_b2` is set. Otherwise it compares attachment positions: forward separation above `x34C`, or absolute vertical separation adjusted by `x2170` above `x350`, dispatches `ftCo_800DA698(gobj,1)`. Within those limits, only a victim behind the grabber causes a signed ground-velocity write capped by `walk_max_vel`; other paths do not zero existing velocity. Threshold comparisons are strict. `fn_800DA190` excludes decimal kinds 6, 13, and 20, independently identified as Link, Samus, and CLink by FighterKind. [Maintenance](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchPull.c#L149-L218), [kind mapping](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L89-L125).

CatchWait and CatchAttack invoke the shared helper without this CatchPull-specific kind filter. Exact original helper names, opaque flag meanings, and tether producer-side lifecycle guarantees remain unrecovered. The header declares only the entry callback. No compiled section contents, layout, or register-allocation claims are made.

Status: synthesized; independent review and live promotion pending.
