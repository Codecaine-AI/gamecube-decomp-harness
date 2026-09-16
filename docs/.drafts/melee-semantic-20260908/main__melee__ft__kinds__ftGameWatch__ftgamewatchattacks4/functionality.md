## AttackS4 and its attached torch

This unit implements Mr. Game & Watch's Fire Attack forward smash and the fighter-side lifecycle of its hand-mounted torch. The header exports ten `void(HSD_GObj*)` routines and one `bool(HSD_GObj*)` removal predicate. These arguments denote fighter objects, including the owner notifications—not torch item objects.

### Entry and deferred setup

`ftGw_AttackS4_Enter` clears `allow_interrupt` and `cmd_vars[0]`, enters `ftGw_MS_AttackS4` with flags 0 and floating arguments `0.0f, 1.0f, 0.0f`, calls `ftAnim_8006EBA4`, then schedules `ftGw_ItemTorchSetup` in `accessory4_cb`. Setup obtains the left-hand position and passes the fighter, position, `FtPart_LHandNb`, and facing direction to the item constructor. It stores the result in `x2254_fireGObj`. Successful creation permits filling each null damage/death callback slot with `ftGw_Init_OnDamage`; occupied slots remain untouched. Regardless of success, setup overwrites the pre/post-hitlag slots and clears its accessory slot. Thus this is one scheduled spawn attempt, not an automatic retry loop. The item constructor attaches the article rather than launching a projectile.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacks4.c#L23-L45; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacks4.c#L107-L119; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchfire.c#L19-L35.

### State updates

The animation callback invokes the common ending dispatcher only when no frames remain. That dispatcher normally reaches Wait for this fighter, but its common exceptional branches must not be erased: boss-kind dispatch, DownSpot, and another early-exit common-state check precede the ordinary Wait path. IASA delegates to the priority-ordered standing input dispatcher only when `allow_interrupt` is nonzero; the first successful check suppresses later checks. The local source does not establish an actionable frame number.

Physics delegates to `ft_80084FA8`: its shared implementation scales friction above maximum walking speed and selects root-translation acceleration versus friction before grounded movement. Collision calls `ft_80084104` before character-specific cleanup. A failed shared check enters Fall; the following cleanup observes `GA_Air` and removes tracked articles, including the torch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacks4.c#L121-L158; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L67; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L55-L89; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatch.c#L555-L582.

### Cross-file article lifetime

The paired hitlag handlers forward the stored item only when non-null. `ftGw_AttackS4_ItemTorchSetFlag` invokes exit-hitlag handling before clearing the fighter's reference; it does not itself delete the item. The item destruction notifier calls this helper with `Item.owner`. Fighter-side damage cleanup requests item destruction and then explicitly calls the helper again. In the normal destruction path the earlier notification has already cleared the pointer, so the second exit-hitlag invocation is a guarded no-op.

The removal predicate returns false exactly for `ftGw_MS_AttackS4`, without mutation. The item animation callback uses it only with a non-null owner; an ownerless article also retires. A true result triggers owner notification and completion, while a false result permits continued owner-dependent animation-speed synchronization. Remaining in AttackS4 therefore prevents predicate-driven retirement, not damage or airborne cleanup.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacks4.c#L49-L102; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchfire.c#L37-L63; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchfire.c#L77-L111.

### Evidence boundaries

Both owned files were read completely in canonical and rendered form; neither renderer reported parse errors. The rendered `ItemTorchOnDestroy` hypothesis is supported independently by the canonical destruction caller and resume-then-clear body, but remains a proposed role name rather than recovered original spelling. Other rendered substitutions were not treated as proof. Source literals do not establish `.sdata2` size, layout, contents, or compiled loads; its three baseline facts remain unresolved. No numeric motion-state value or compiled layout is inferred. The saved ledger accounts for all 63 facts and 40 links, retaining historical duplicate links as distinct baseline records.

Status: synthesized; independent review and live promotion pending.
