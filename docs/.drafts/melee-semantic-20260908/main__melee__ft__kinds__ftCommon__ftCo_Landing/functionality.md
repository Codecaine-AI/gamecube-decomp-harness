# Common landing

Landing_Enter prepares the fighter, changes the caller-selected motion, stores allow_interrupt, and clears selected character fields. Mario and Dr. Mario lose tornado charge and cape boost; Peach clears specialairn_used and conditionally calls its landing helper; Kirby clears three flags, Mewtwo clears Confusion boost, and Marth/Roy, Game & Watch and Ice Climbers clear unnamed fields. Their exact unnamed roles are not inferred.

Basic normal entry selects Landing with policy true; basic special entry selects LandingFallSpecial with policy false. Both use frame zero and speed one. Configurable special entry uses (0.1 + fp->x2EC) / landing_lag without a divisor guard. All three redirect Hammer holders to HammerLanding, bypassing requested configuration.

## Callback boundaries

Normal and special landing tables install the shared Anim, IASA, Phys and Coll callbacks. Anim calls the common action-ending helper only when frames are exhausted. Collision can independently exit through common support handling. Physics applies standard speed-dependent ground friction and movement. LandingAir reuses Anim, Phys and Coll but has an empty IASA.

IASA skips input checks when frame < normal_landing_lag or the entry-supplied policy is false. An unordered NaN comparison does not satisfy that early-return guard. Its priority starts side, up, neutral and down specials; the canonical Attack100_CheckInput name hides up-special dispatch. Grab, smashes, tilts, neutral attack, defensive/taunt checks, jump, dash, time-limited crouch, turn and walk follow. First true returns. Crouch additionally requires frame < lag + frame_speed_mul.

The policy does not imply every caller uses Landing IASA. Cargo Landing's table has NULL IASA. Hammer Landing's IASA is empty, and its third initializer argument Ft_MF_KeepFastFall has value one in the boolean parameter position; the separate fourth argument supplies motion flags.

## Object evidence

The .data target is a 108-byte, 27-entry switch table. The source section is 108 bytes; the split section is 112 bytes with four trailing zero bytes outside the 27 relocated entries. Exact section headers, bytes and relocation addends for source and split objects are recorded in object-metadata.json. The .sdata2 literal values are zero, one and 0.1; source WRITE|ALLOC flags must be distinguished from split ALLOC-only flags. Existing artifacts were read without rebuilding or regenerating the pinned report.

## Review

All 181 owned C/H lines were read in canonical and rendered forms. All ten targets, source entity and fifteen empty parameter entities are accounted. All fifty baseline facts have exact ID/version dispositions. Nine corrections are proposed; supported facts are retained without rewrites. Fifteen exact outgoing edges are retained; one is unresolved; the interruptibility edge needs a rationale correction owned by the coordinator. No names are proposed and no shared KB/source is changed.

## Canonical evidence

- .data: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L48-L80, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615
- .sdata2: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L44-L112, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615
- ftCo_Landing_Enter: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L38-L81, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.h#L44-L48, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L238-L249, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_HammerLanding.c#L17-L34
- ftCo_Landing_Enter_Basic: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L83-L91, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_HammerWait.c#L139-L150
- ftCo_LandingFallSpecial_Enter_Basic: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L93-L101, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_HammerWait.c#L139-L150
- ftCo_LandingFallSpecial_Enter: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L103-L113, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_HammerWait.c#L139-L150
- ftCo_Landing_Anim: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L115-L120, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_LandingAir.c#L68-L82, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L54-L93
- ftCo_Landing_IASA: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L122-L150, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L44-L101, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L44-L47
- ftCo_Landing_Phys: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L152-L155, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L59, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_LandingAir.c#L68-L82
- ftCo_Landing_Coll: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L157-L160, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1081-L1102, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_LandingAir.c#L68-L82
- src/melee/ft/kinds/ftCommon/ftCo_Landing.c: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L38-L160, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L597-L615
