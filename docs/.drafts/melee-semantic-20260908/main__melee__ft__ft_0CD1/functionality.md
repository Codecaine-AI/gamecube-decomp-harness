# Common held-item swing lifecycle

This TU defines six common lifecycle functions in `src/melee/ft/ft_0CD1.c`. Its header also declares neighboring item-specific routines; declarations do not confer ownership of their implementations. Canonical names remain authoritative. The rendered Swing aliases are descriptive hypotheses, not recovered symbols; the damage-callback alias also omits synchronous collision-cleanup use. The implementation contains no explicit C data objects or local allocation/free operations. Source zero literals do not establish compiled `.sdata2` contents or layout.

## Entry and animation

`ftCo_800CD140` clears `throw_flags`, calls `Fighter_ChangeMotionState` with caller motion, flags and speed and zero start/blend arguments, processes animation through `ftAnim_8006EBA4`, arms `mv.co.swing.x0`, stores the selector in `mv.co.swing.x4`, then calls `ftCommon_8007E79C(gobj, 1)`. Animation processing precedes the latch and selector writes. There is no local item-presence check or argument validation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CD1.c#L14-L24.

`ftCo_800CD1BC` calls the neutral-routing helper and then pickup-style handling only when `ftAnim_IsFramesRemaining` returns zero. Unlike generic interruption cleanup, this path has no item-presence guard. Animation completion and neutral routing are delegated; neither a single frame-counter comparison nor universal Wait selection should be inferred. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CD1.c#L26-L32. The inherited research additionally establishes the part/joint-based animation predicate and specialized neutral routes.

The item-event helpers optionally invoke fighter-kind callbacks from `ftData_OnItemDrop` and `ftData_OnItemPickup`. Their own bodies do not transfer item ownership or clear the held-item pointer. Presentation and restoration effects remain callback-dependent. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L1015-L1029.

## Input and continuation

`ftCo_800CD204` reads canonical `input.held_buttons[0]`. Observing A absent clears the latch. It then evaluates `ftCheckThrowB3` before testing the latch: a set B3 bit is consumed even when disarmed, including on the same invocation that observes A absent. Only a true predicate and nonzero latch request selector 3. The helper never rearms the latch; its invariant concerns sampled input rather than physical changes between invocations. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CD1.c#L34-L43; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L255-L263.

The dispatcher asserts item presence and maps six numeric item kinds to swing families. Selector 3 bypasses the ordinary motion table: it returns `swing_type + 341` for `FTKIND_CAPTAIN` and asserts otherwise. Selectors 0 and 1 permit an early pickup-related return. The table column is not generally range-checked. Numeric selectors 3 and 4 receive no asserted jab/tilt/smash/dash labels. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftswing.c#L15-L99.

## Physics

Exactly selector 4 forwards `x420 * ground_friction` and facing direction to `ft_80085030`; `(0, ground_friction)` is a comma expression, not multiplication by zero. Every other integer selects ordinary friction handling. The ordinary helper multiplies friction only when computed ground-speed magnitude is strictly greater than `walk_max_vel`; equality skips multiplication. Neither coefficient's value proves an increase. Downstream, `x594_b0` selects translation-derived acceleration instead of friction application; both branches perform grounded movement. No local sanitization establishes bounded behavior for exceptional floating inputs. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CD1.c#L45-L55; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L55-L89.

## Collision and callback lifetime

`ftCo_800CD2C4` skips cleanup and Fall invocation when `ft_800827A0` returns nonzero. On zero it synchronously calls `cb(gobj)`, then invokes Fall entry after normal callback return. It neither stores nor null-checks the callback and performs no cancellation or post-callback validation. The callback must be callable and leave the object valid for Fall processing. The collision predicate copies positions and writes corrected position back before branching on its result; nonzero does not imply no mutation. Fall entry includes specialized routes, so its invocation is not a guarantee of ordinary Fall selection. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CD1.c#L57-L63; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L406-L424; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L47-L71.

`ft_800CD31C` dispatches pickup-style handling only when the current `item_gobj` is non-null. It does not establish that this is the entry-time item. Five families register it as `take_dmg_cb` after common entry and also pass it for synchronous collision cleanup. Harisen instead uses `ft_800CD604`, which performs additional item operations. Parasol supplies entry flags `0x400`; the other inspected families supply zero. Star Rod and Lipstick install accessory callbacks after common entry. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CD1.c#L65-L71; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CD3.c#L8-L169; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftstarrodswing.c#L11-L39; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlipstickswing.c#L13-L41.

## Accepted uncertainties

All four compiled-section claims remain unresolved without object/section and relocation evidence. Historical aliases, register-locator ABI assignments, complete player-facing item-name expansions, numerical friction effects, exact target exceptional-float outcomes, universal regrip effects and engine-wide damage-callback invocation/clearing remain unproved. The collision wrapper establishes position flow and conditional cleanup/Fall invocation, but its delegated `inline2` geometry is not a completed floor-support proof. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/mpcoll.c#L4012-L4017.

Status: synthesized; independent review and live promotion pending.
