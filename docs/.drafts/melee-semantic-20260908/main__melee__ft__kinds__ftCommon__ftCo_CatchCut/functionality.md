# Captor CatchCut release lifecycle

Entry assigns velocity before selecting CatchCut. GA_Air gets self_vel.x=-facing*x374 and self_vel.y=x378; other values get gr_vel=-facing*x370. Motion starts at frame zero, speed one, blend zero and flags zero. A true second argument then calls CaptureCut_Enter on the linked victim; no null check exists. That complementary entry invokes pair-release cleanup and selects CaptureCut.

Animation completion calls ftCommon_8007D92C only when no frames remain. Air goes to Fall; other situations use the common dispatcher, which has special grounded branches before ordinary Wait. The IASA callback is empty. This callback performs no transitions; the body does not establish global interruptibility.

Ground physics writes friction-derived ground acceleration and projects ground velocity onto the floor tangent; the aerial helper applies fast-fall or gravity and horizontal input drift. Collision routes ground support failure to Fall. The aerial path calls its landing response when terrain contact is accepted; otherwise wall-jump and cliff routines are offered. The landing response compares vertical speed with a fighter threshold to choose common neutral dispatch versus basic landing.

## Storage and limits

Existing source and split objects plus the frozen report corroborate an eight-byte float zero/one pool. Source ELF flags are 3 (WRITE|ALLOC); original split flags are 2 (ALLOC). No build or source mutation ran. Shared tuning signs are not independently established, so exact recoil formulas replace categorical backward/upward claims. Shared terrain internals and common-data values remain family-owned.

## Fact and link coverage

All 54 owned C lines plus recorded dependency pages were read canonical and rendered. All 26 facts have explicit IDs and versions: 22 retained, three superseded, one unresolved. Add two facts for the previously empty section/source subjects, totaling five proposed writes. Six targets, seven entities and all six empty parameter identities are accounted.

15 exact outgoing-link records are retained and one is unresolved with fresh canonical evidence in link-dispositions.json. Semantically duplicate links remain separate; no link changes are proposed. Four callback names are canonical. Existing CatchCut_Enter hypothesis is retained for the address-named entry helper.

## Evidence

- ftCo_800DA698: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c#L8-L22, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureCut.c#L24-L36, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureCut.c#L101-L113
- ftCo_CatchCut_Anim: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c#L24-L29, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L596-L604, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L54-L98
- ftCo_CatchCut_IASA: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c#L31-L31
- ftCo_CatchCut_Phys: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c#L33-L43, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L51-L59, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L133-L152, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L374-L394
- ftCo_CatchCut_Coll: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c#L45-L53, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L406-L424, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L806-L848, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L504-L512
- .sdata2: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c#L17-L18
- src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CatchCut.c#L8-L53, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureCut.c#L24-L36, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureCut.c#L101-L113

Independent review defers the unconditional pair-release premise in one physics fact and one link. Entry calls victim release only when its second argument is true. Proposal unchanged.
