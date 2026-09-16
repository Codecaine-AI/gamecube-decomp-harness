## ItemParasolOpen

This unit implements the fighter-side Parasol opening gate, two entry variants, and animation, interrupt, physics and collision callbacks. Its header declares seven public routines. Rendered CheckInput and Enter names are reasonable behavioral hypotheses, not proof of original spellings.

### Eligibility and entry
`ftCo_800CEE70` rejects `x2221_b5`. Otherwise it requires either `x2221_b7` or vertical stick input at least `open_parasol_threshold`, nonpositive vertical self-velocity, and normalized Parasol status 6. Success calls `ft_800CEF08` and returns true; failure returns false. There is no independent airborne-state test in this predicate.

Status 6 is not a raw item motion: the classifier maps ordinary Parasol motion 4 and Peach Parasol motions 0 or 2 to 6. Entry uses a different selector: Peach kind with non-null `u.pe.parasol_gobj_0` selects the Peach opening motion; otherwise it selects the common opening motion.

Both entries save `motion_id` in `mv.co.parasol_open.prev_msid`, change to the selected opening motion with flags 0, frame 0 and speed 1, call `ftAnim_8006EBA4`, clear `x2221_b7`, and set `x2221_b4`. Only if `x2221_b6` is set do they copy common `x59C` into `x2104` and clear that flag. Ordinary entry supplies blend 0; alternate entry `ftCo_800CEFE0` supplies blend 10 and ignores its integer parameter. Peach startup assigns FallSpecial before calling the alternate entry with either common `x59C` or Peach attribute `x90`; the callee nevertheless uses common `x59C`.

Evidence: [gate and entries](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemParasolOpen.c#L22-L73), [classifier](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L1088-L1121), [selector](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/inlines.h#L55-L64), [Peach callers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachspecialhi.c#L200-L220), [transition declaration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.h#L44-L48).

### Saved predecessor and interrupts
Animation does nothing while frames remain. At exhaustion, saved FallSpecial selects `ftCo_800CF3C8`; every other predecessor selects `ftCo_800CF280`. Only non-FallSpecial entries try airborne special input, `ftCo_80095328(gobj, NULL)`, `ftCo_800C3B10`, and aerial attack/item-throw input, in that order with immediate return on success. `ftCo_800CB870` is outside the predecessor guard but is reached only if no earlier check returned. Opening therefore preserves special-fall provenance, rather than demonstrating unrestricted cancellation of helplessness.

Evidence: [animation and IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemParasolOpen.c#L75-L97).

### Movement and landing
Physics scales gravity and terminal velocity by common `x590` and passes them to `ftCommon_Fall`. At or above the inclusive absolute horizontal-stick threshold `x258`, drift and target velocity are computed from stick input, air attributes and `x58C`; below threshold both requested values are zero. Both branches pass aerial friction to `ftCommon_8007D140`. Symbolic multiplication proves scaling, not reduced gravity.

Collision unconditionally delegates to `ft_8008370C` with `ftCo_Landing_Enter_Basic`. That downstream callback preserves the HammerLanding exception and otherwise enters ordinary Landing. The local wrapper contains no timer or guard.

Evidence: [physics and collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemParasolOpen.c#L99-L129), [landing exception](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L83-L91).

### Evidence limits
Source literals do not establish `.sdata2` extent, ordering, encoding or placement. Exact inferred name spellings, the runtime value of `x590`, and the complete cross-file lifetimes of `x2104` and the control bits remain unresolved.

Status: synthesized; independent review and live promotion pending.
