# AttackHi3

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Common up-tilt input recognition, entry and four state callbacks.

## Input and Entry

A newly pressed A button, stick Y at least attackhi3_stick_threshold_y and atan2(Y, abs(X)) strictly greater than x20_radians qualify. This helper has no local ground-status, flick timer or facing test. Eligible held items divert to LightThrowHi; otherwise local doEnter starts AttackHi3. Every accepted branch returns true; failed guards return false without dispatch. Item eligibility includes the shoulder/input and item-specific predicate in the shared throw helper. [Input](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackHi3.c#L19-L45), [angle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L606-L609), [throw](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemThrow.c#L46-L54).

Entry clears allow_interrupt, changes motion to AttackHi3 with no preserved flags, frame zero, rate one and blend zero, then calls ftAnim_8006EBA4. doEnter has file-local linkage through its earlier static declaration; the object marks it local. Its canonical name is retained, with no invented public entry API.

## Animation and Actionable Window

No remaining animation frames invokes ft_8008A2BC. Ordinary fighters reach Wait after exceptional checks; bosses have separate paths. While allow_interrupt is false, IASA does nothing. Once true, it delegates to the ordered Wait input dispatcher; the first successful predicate returns before later checks. The shared script command explicitly enables the flag. This establishes the mechanism without claiming a particular fighter animation's interruption frame. [Animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackHi3.c#L47-L52), [script command](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L504-L510), [standing inputs](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L67).

## Physics and Collision

Physics delegates to ft_80084F3C: base ground friction is multiplied by friction_when_above_walk_speed only when ABS(gr_vel)>walk_max_vel. Friction becomes primary ground acceleration, clamped to avoid crossing zero; ground movement applies the surface multiplier and projects along the ground normal. This TU adds no move-specific steering.

Collision unconditionally delegates to ft_80084104. That helper calls ft_800827A0 and invokes Fall on false. The inherited facts only describe delegation and do not assert a physical interpretation of the underlying map query. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53), [collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050).

The active AttackHi3 table row uses all four callbacks. Six function targets, one data target, one source subject and six empty parameter inventories are accounted for.

## Literal Pool and Review State

Existing objects contain 000000003f800000: f32 zero then one. The entry assembly loads zero for frame/blend and one for speed. Split flags are ALLOC; source flags are ALLOC|WRITE. Two data facts are corrected; all other inherited facts and all fifteen exact outgoing records are retained. No gameplay table or global alias is invented. [Object evidence](data-corroboration.json).

## Canonical and Rendered Sources

- [src/melee/ft/kinds/ftCommon/ftCo_AttackHi3.c](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_AttackHi3/pages/src__melee__ft__kinds__ftCommon__ftCo_AttackHi3.c.1-70.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_AttackHi3.h](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_AttackHi3/pages/src__melee__ft__kinds__ftCommon__ftCo_AttackHi3.h.1-15.json>)

[Supplemental canonical reads](supplemental-canonical.json), [fact dispositions](fact-dispositions.json), [exact relationship review](link-dispositions.json).
