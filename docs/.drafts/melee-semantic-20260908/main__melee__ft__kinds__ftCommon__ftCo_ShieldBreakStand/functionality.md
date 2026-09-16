# Shield-break standing phase

Draft at `c302741689bd67c361cd7faadb221df3193992c3`.

ShieldBreakDown animation completion calls `ftCo_80098F3C`. It chooses StandU only when current motion is DownU; every other motion ID selects StandD. Entry starts frame zero, speed one and blend zero. Its flags bypass the common resets for whole-body/hurtbox hit status, model, material animation and color animation. They do not promise preservation of every fighter field: the surrounding motion-entry machinery can still reset specially configured hurtboxes.

The two stand states register the same animation, IASA, physics and collision callbacks. The animation callback waits while ftAnim_IsFramesRemaining is true, then calls Furafura entry. The helper queries relevant animated model parts or blend joints; it is not a local countdown. Furafura entry restores shield health and initializes the mashable timer to max(x2F8 - damage percent, 0) + x2FC. Only the first term is clamped. Later Furafura updates subtract x300, apply button/stick mash reductions and leave through ft_8008A2BC when the timer reaches zero.

IASA is an unconditional no-op, so that hook provides no input escape. Physics forwards to ft_80084F3C, which applies ground friction (scaled above walk speed) and ground movement. Collision forwards to ft_80083F88, which can call Fall entry when its collision helper returns GA_Ground; the numerical/code condition is retained without inferring ground-loss meaning from the enum spelling. Thus animation completion is not the only possible delegated transition.

All five functions take one Fighter_GObj pointer and return void. The header agrees with the definitions. The existing entry alias is supported; the four canonical callback names remain unchanged. The .sdata2 pool is corroborated by existing object bytes and the frozen report; no build ran.

## Evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ShieldBreakStand.c#L13-L42
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ShieldBreakDown.c#L35-L40
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Furafura.c#L15-L55
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1027-L1033
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L966-L985
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1105-L1107
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L2433-L2454
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L515-L538
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L670-L718
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L47-L64
