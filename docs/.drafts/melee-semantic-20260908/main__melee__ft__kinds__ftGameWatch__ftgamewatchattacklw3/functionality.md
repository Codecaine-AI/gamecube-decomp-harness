## Game & Watch down tilt

This unit implements AttackLw3 and the fighter-side lifetime of its manhole article. The header declares nine public routines; the two hitlag helpers are static in the C file.

### Entry and action updates

`ftGw_AttackLw3_Enter` performs down-tilt initialization only when `ftpickupitem_80094790` returns false. It clears `allow_interrupt`, changes to `ftGw_MS_AttackLw3` with arguments 0.0f, 1.0f and 0.0f, calls `ftAnim_8006EBA4`, and schedules setup through `accessory4_cb`. No numeric motion ID is inferred. Animation exhaustion calls `ftCo_800D638C`; its canonical implementation enters SquatWait. IASA is gated by `allow_interrupt` and checks side/up/down smash, side/up/down tilt, neutral attack, jump, dash, squat, turn and walk in that exact first-success order. This unit does not establish the frame that enables interruption or input-buffer semantics.

Physics delegates to `ft_80084F3C`, whose canonical body selects ground friction, scales it above maximum walk speed, applies friction and updates ground movement. Collision calls `ft_80084104` before `ftGw_Init_8014A538`: the former enters Fall when its check returns false; the latter removes tracked props if the resulting fighter state is GA_Air.

Evidence: [action callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacklw3.c#L140-L200), [SquatWait destination](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SquatWait.c#L50-L86), [physics implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53), [Fall guard](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050).

### Article and saved-item lifetime

Setup distinguishes `x2248_manholeGObj`, which saves a previously held item, from `x2250_manholeGObj2`, which tracks the active manhole. Only an absent active article triggers hand-position calculation, optional held-item preservation and the spawn call. An existing article skips that work but still reaches callback installation. A non-null active article permits filling empty death/damage callback slots with `ftGw_Init_OnDamage`; existing callbacks are preserved. Pre/post-hitlag callbacks are assigned and the accessory callback is cleared unconditionally, including spawn failure.

The static hitlag helpers forward only a non-null active article to paired item wrappers. Fighter-side removal calls exit-hitlag before clearing the active slot, then conditionally restores the saved item, clears its saved slot and invokes the item/pickup helpers. Removal does not itself destroy the article or clear the installed hitlag callbacks.

Damage cleanup is guarded by the active article pointer. Its item-side call can first invoke fighter removal through the owner and then destroy the item; the subsequent explicit fighter removal therefore can be a second pass over cleared slots. Shared Game & Watch damage and airborne cleanup both reach this path. Normal article animation separately asks whether the owner has left AttackLw3, invokes owner cleanup and returns true when eligible. An absent owner also makes the item animation complete, without calling the fighter predicate.

Evidence: [setup and cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacklw3.c#L39-L135), [item-side lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchmanhole.c#L18-L105), [shared cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatch.c#L555-L582).

### Exceptional branches and evidence limits

If spawning fails after saving a held item, setup contains no immediate restoration or retry: it still clears `accessory4_cb`, while damage cleanup does nothing when the active article is null. Recovery of that saved item through other engine paths is not established by this pass. Rendered function names were treated as hypotheses, not independent evidence. Source literals do not prove `.sdata2` size, order or provider relationships; no compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
