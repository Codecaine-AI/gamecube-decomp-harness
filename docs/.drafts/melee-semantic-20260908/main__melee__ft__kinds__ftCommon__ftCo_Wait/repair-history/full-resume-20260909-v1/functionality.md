# Wait

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Four callbacks maintain ordinary standing idle and select outgoing actions. No entry function or data target is owned by this TU.

## Animation

A set x2224_b2 enters DownSpot; the shared helper selects its U or D motion. Otherwise Wait passes ft_data->x24 to the shared idle-animation processor. That helper changes animation only after frames expire. Null wait data, or held items for fighters other than Mewtwo/Fox, replay the current animation; other cases select from weighted idle data and avoid repeating the current animation except for IDs 2 or 31. The selected animation resets associated command-script state. The TU does not own those character tables. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L34-L42), [idle helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftwaitanim.c#L11-L105).

## Input Priority

IASA calls 21 predicates in source order and returns at the first true result. The first four dispatch side, up, neutral and down specials. In particular, ftCo_Attack100_CheckInput dispatches ftData_SpecialHi despite its canonical name; the inherited rapid-jab label is corrected. Subsequent checks are grab, three smashes, three tilts, neutral attack, two defensive predicates, two appeal predicates, jump, dash, squat, turn and walk. Address names are preserved where detailed semantics are not needed. There is no local ground or allow_interrupt guard: callers choose when to invoke this common dispatcher. [Exact order](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L67), [special dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L44-L100), [squat](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Squat.c#L35-L69).

## Physics and Collision

Physics selects base or above-walk-speed friction, queues primary ground acceleration and applies ground-normal movement, then clears shield_hit.skip_update_pos. Integration of pending acceleration into gr_vel occurs in the shared fighter update. No immediate subtraction from gr_vel is performed by the friction helper. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L69-L73), [integration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L2292-L2297), [followup flag](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3077-L3080).

Collision delegates to ft_80084280, also used by Landing. If a nonzero player-nudge X opposes facing, it uses ft_800827A0; otherwise it uses the local synchronized map query. A true query result returns; otherwise a successful ftCo_8009A3C8 returns; only the remaining path invokes Fall. These are literal query predicates, not a new interpretation of underlying collision semantics. The archived Discord-backed relationship is independently supported by both canonical callers and the shared helper. [Collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1062-L1099), [Landing caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L157-L160).

## Review Sources

- [src/melee/ft/kinds/ftCommon/ftCo_Wait.c](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_Wait/pages/src__melee__ft__kinds__ftCommon__ftCo_Wait.c.1-79.json)
- [src/melee/ft/kinds/ftCommon/ftCo_Wait.h](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_Wait/pages/src__melee__ft__kinds__ftCommon__ftCo_Wait.h.1-11.json)

Four targets and nine subjects, including four empty parameter inventories, are reviewed across all 90 owned lines. Twenty-four baseline facts receive individual decisions; two corrections are proposed. All seven exact outgoing relationships are retained. [Fact decisions](fact-dispositions.json), [links](link-dispositions.json), [supplemental canonical reads](supplemental-canonical.json), [existing report](report-corroboration.json).
