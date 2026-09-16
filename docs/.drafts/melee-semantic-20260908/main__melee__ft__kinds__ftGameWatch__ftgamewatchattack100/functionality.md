## Greenhouse rapid-jab callback family

This unit implements Mr. Game & Watch's Attack100 Start, Loop and End entry, animation, IASA, physics and collision callbacks. The header declares all fifteen functions and identifies the family as Greenhouse neutral attack. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattack100.h#L1-L22)

### Phase progression

- Start entry calls `ftCo_800D6B00(gobj, ftGw_MS_Attack100Start)` and schedules `ftGw_Attack11_ItemGreenhouseSetup` through `accessory4_cb`. Startup animation enters Loop only when `ftAnim_IsFramesRemaining` returns false; Start IASA does nothing.
- Loop entry unconditionally calls `Fighter_ChangeMotionState` with `ftGw_MS_Attack100Loop`, flags 0, floating arguments `0.0f, 1.0f, 0.0f`, and NULL, then schedules `ftGw_Attack11_DecideAction`. Loop animation delegates to `ftCo_800D6C60`, supplying End entry as its exit callback. Loop IASA delegates to the common Attack100 loop IASA handler; no local repeat threshold or input predicate is implemented here.
- End entry uses the same literal arguments with `ftGw_MS_Attack100End` and schedules the same accessory dispatcher. End animation delegates to `ftCo_Attack100End_Anim`; End IASA is inert. These empty IASA callbacks do not establish global immunity to interruption.

[Canonical phase implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattack100.c#L19-L115)

### Deferred accessory lifetime

Startup setup reuses an existing Greenhouse article or attempts to spawn one. Successful creation installs damage/death callbacks only where those slots are empty, and installs hitlag callbacks. Setup clears `accessory4_cb` even when spawning fails. In contrast, `DecideAction` does nothing—including leaving `accessory4_cb` installed—when the article pointer is NULL. With an article, it reads the motion ID at dispatch time, selects the matching article command, installs lifecycle callbacks, and clears itself. Consequently, entering Loop or End schedules synchronization rather than guaranteeing that an article exists or immediately adopts that phase. [Setup and dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattack11.c#L23-L80)

### Movement and collision

All three physics callbacks forward to `ft_80084FA8`. The helper scales friction when absolute ground velocity exceeds maximum walking speed. Its downstream helper either writes acceleration from animation translation and facing direction when `x594_b0` is set, or applies friction, then updates ground movement. This is not uniformly a friction-only path. [Physics helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L55-L89)

Each collision callback calls `ft_80084104` before `ftGw_Init_8014A538`. The former enters Fall when its support query returns false; the latter tests the resulting `ground_or_air` and invokes character prop-removal routines only for `GA_Air`, including Greenhouse. The ordered calls permit same-callback cleanup after ground loss. [Collision wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050) [Airborne cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatch.c#L568-L582)

### Evidence boundaries

Both owned canonical and rendered files were read completely. Rendering reported no parse errors; the C view substituted six calls using two proposed helper names. Those names were treated as hypotheses and checked against canonical helper bodies. No compiled artifacts were supplied, so source literals do not prove `.sdata2` size, encoding, order, pooling, or consumers. Symbolic motion-state identifiers are preserved without assigning unverified numeric equivalents. Exact 3% damage remains unverified by the reviewed source.

Status: synthesized; independent review and live promotion pending.
