## Fire / Rescue up-special subsystem

This unit implements Mr. Game & Watch's grounded and aerial Fire entry points, shared animation/input/physics/collision behavior, and fighter-side Rescue article management. The header declares fourteen public functions; the two hitlag callbacks are static in the implementation. [Interfaces](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.h#L1-L23).

### Entry and shared movement

Both entries call `ftCommon_8007D60C`, select their respective named motion state with arguments `0, 0.0f, 1.0f, 0.0f, NULL`, reset all four command variables, schedule `ftGw_SpecialHi_ItemRescueSetup` through `accessory4_cb`, initialize animation through `ftAnim_8006EBA4`, and call `ft_80088510(fp, 290066, 127, 64)`. Only grounded entry explicitly zeros vertical animation velocity and vertical self velocity. Grounded Anim, IASA, Phys and Coll callbacks forward unchanged to their aerial counterparts; “grounded” identifies the move variant, not a guarantee of current physical ground contact. [Entry and initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L113-L161).

IASA acts only while `cmd_vars[0] == 0`. Horizontal input must exceed the Rescue stick-range threshold strictly. The excess is signed by the original input, multiplied by `x5C_GAMEWATCH_RESCUE_ANGLE_UNK`, and negated into `lstick_angle`. Facing and part-0 Y rotation are updated, then the command guard becomes one. Failed qualification makes no writes. This is one-shot while the guard remains set; the owned source does not establish what external animation commands may do to it. [Steering](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L183-L221).

Physics forwards to `ft_80085154`. Its canonical implementation rotates the facing-adjusted Z and Y animation translation offsets by `lstick_angle`, writing `self_vel.x` and `self_vel.y`. This independently supports the rendered movement hypothesis without treating the proposed name as evidence. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L223-L233); [velocity calculation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L127-L136).

### Animation and collision outcomes

Animation completion, not an explicit apex test, triggers the ending. Zero `x60_GAMEWATCH_RESCUE_LANDING` requests ordinary Fall; any nonzero value calls `ftCo_80096900(gobj, 1, 0, 1, 1.0f, landing_value)`. That common helper normally enters FallSpecial and stores landing lag, but redirects through `ftCo_80090780` when `x2224_b2` is set. Therefore the local call is not an unconditional final-state guarantee. [Animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L157-L181); [common exceptional branch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L28-L59).

Collision handling runs only when `cur_anim_frame > 4.0f`:

- For nonnegative vertical velocity, including zero, successful `ft_80081D0C` removes the Rescue article, calls `ftCommon_8007D7FC`, requests LandingFallSpecial with the Rescue landing value, and explicitly clears `death2_cb` and `take_dmg_cb`.
- For negative vertical velocity, the direction argument is +1 only when facing equals +1.0 exactly; otherwise it is -1. A successful ground-and-ledge test requests LandingFallSpecial. Otherwise a successful cliff test invokes `ftCliffCommon_80081370`.
- Descending landing and cliff branches do not explicitly remove the Rescue article or clear those callbacks here. Failed tests make no local transition.

[Complete collision behavior](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L235-L279).

### Rescue creation and cross-file lifetime

Setup performs work only if `x226C_rescueGObj` is null. It obtains the TopN position, subtracts `2.5f * model_scale` from Y, and calls `it_802C8038` with the fighter, position, TopN part, `motion_id - ftGw_MS_SpecialHi`, facing, and `2.5f`. The subtraction is an item-state selector; this review does not infer unverified numeric motion-state values. The item constructor selects the Rescue kind, stores a parent back-reference, and uses the passed state selector. Its `arg2` and final floating parameter are unused in the inspected body, so passing 2.5 does not establish actual article scaling. [Fighter setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L30-L54); [constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchrescue.c#L27-L55).

Creation success alone installs `ftGw_Init_OnDamage` in the death2 and damage slots. Either creation result installs the paired hitlag callbacks and clears `accessory4_cb`. If an article was already present, setup makes no writes, including no accessory-slot clearing. The hitlag callbacks guard the retained pointer and forward it through the item wrappers to `it_8026B724` and `it_8026B73C`. [Registration and guarded callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L32-L111); [item wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchrescue.c#L74-L82).

`ItemRescueSetNULL` clears only the fighter's retained article pointer, death2 callback and damage callback. It does not destroy an item or clear hitlag callbacks. `ItemRescueRemove` does nothing when the retained pointer is null; otherwise it calls item teardown and then SetNULL. Item teardown conditionally notifies the fighter only when the saved back-reference matches the item owner, clears both item references, and invokes `Item_8026A8EC`. General damage cleanup and a separate air-only cleanup routine both call the fighter removal wrapper. [Fighter cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L72-L91); [item cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchrescue.c#L57-L72); [external callers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatch.c#L555-L582).

The removal predicate returns false only in the two named Fire states and true otherwise. Item animation consumes this predicate and removes an article whose parent leaves those states; absent-parent handling also tears down the item. This supplies a cross-file cleanup path for transitions without explicit local removal, but does not prove same-frame cleanup ordering. [Predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecialhi.c#L56-L70); [item lifetime consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchrescue.c#L107-L146).

### Review result

All owned canonical and rendered pages, all 34 subjects, all 88 facts, and all 47 links were reviewed. The checkpoint ledger explicitly retains 84 facts and 45 links and marks four facts and two links unresolved, all concerning unsupported compiled `.sdata2` attribution. Rendered pages had no parse errors; external proposed names were treated as hypotheses. No source or KB writes, entity changes, merges, or compiled-layout claims are proposed.

Status: synthesized; independent review and live promotion pending.
