# AttackLw4

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Common down-smash recognition, item/Ness dispatch, generic entry and four callbacks.

## Input and Entry

The local checkLStick requires newly pressed A, stick Y at or below xD4 and vertical tilt timer strictly below xD8. The alternative is a C-stick crossing from previous Y strictly above xD4 to current Y at or below it. Outer C-stick recognition does not call canUseCstick. That extra permission gate belongs to the held-item substitution path: a held item plus the A/item predicate or permitted C-stick crossing enters LightThrowLw4. The permission helper succeeds when its common-mode query is false or its held-item predicate is zero. Accepted input without a throw enters Ness-specific AttackLw4 for Ness and local doEnter for everyone else. There is no local ground guard. [Input](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.c#L22-L61), [C-stick](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0DF1.c#L52-L70), [permission](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L304-L313).

The Ness helper selects its own motion, initializes yo-yo state and installs damage/accessory callbacks. This TU does not own that implementation. Generic doEnter clears allow_interrupt and selects AttackLw4 with no preservation flags, frame zero, rate one and blend zero, then runs shared animation setup. doEnter is file-local; checkLStick is source-covered but not a separate manifest target.

## Animation and Interrupts

Animation expiry invokes the shared boss/neutral dispatcher, ordinarily reaching Wait after exceptional checks. IASA does nothing while allow_interrupt is false and runs the ordered Wait dispatcher when true. The script command that enables this flag is verified; no fighter-specific animation timing is claimed. All four generic callbacks are installed in the AttackLw4 table row. [Animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.c#L63-L68), [interrupts](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.c#L54-L75), [table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L838-L848).

## Physics and Collision

Physics delegates to ground friction and movement. Friction scales only when ABS(gr_vel) exceeds walk_max_vel, becomes primary ground acceleration and is projected with ground velocity along the floor normal. Collision delegates unconditionally; the shared caller invokes Fall on a false ft_800827A0 result. No physical interpretation of the deeper map query is added. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53), [collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050).

## Literal Pool Correction

The sixteen bytes are 4330000000000000000000003f800000: f64 2^52, f32 zero and f32 one. The first eight bytes are meaningful. Input assembly loads the unsigned tilt timer, constructs a double with high word 0x4330, subtracts the 2^52 bias, and compares against xD8. Entry loads zero and one. Existing split flags are ALLOC; source flags are ALLOC|WRITE. Four inherited data facts are corrected; no padding field or gameplay table is invented. [Source comparison](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.c#L22-L61), [assembly and objects](data-corroboration.json).

## Review Sources

- [src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.c](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_AttackLw4/pages/src__melee__ft__kinds__ftCommon__ftCo_AttackLw4.c.1-86.json)
- [src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.h](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_AttackLw4/pages/src__melee__ft__kinds__ftCommon__ftCo_AttackLw4.h.1-15.json)

[Supplemental canonical reads](supplemental-canonical.json), [fact dispositions](fact-dispositions.json), [exact relationship review](link-dispositions.json). All 101 owned lines and fourteen subjects are reviewed.
