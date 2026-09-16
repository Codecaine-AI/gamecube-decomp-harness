## Master Hand Walk

This unit defines the WalkShoot, Walk2 and WalkLoop animation/IASA/physics/collision callback families, plus entry helpers for Walk2, WalkLoop and WalkWait. The header declares all fifteen functions. The frozen gameplay association is Finger Walk; rendered names were treated as hypotheses, not independent evidence.

### State progression
- `ftMh_MS_353_80151DC4` selects `ftMh_MS_Walk2`. Walk2 animation exhaustion calls `ftMh_MS_350_80151EB4`, which selects `ftMh_MS_WalkLoop`. Both entry helpers use `(0, 0, 1, 0, 0)` after the state argument and then call `ftAnim_8006EBA4`.
- WalkLoop obtains a helper-selected position through `ftBossLib_8015C244` and `ftLib_800866DC`, subtracts the current position, and compares the full three-dimensional magnitude strictly against `x4C`. A successful comparison calls `ftMh_MS_349_80151CA8` in the Slap unit. That callee enters WalkShoot, sets `cur_pos.y = x50.x`—with an explicit source TODO questioning this assignment—and clears horizontal self-velocity.
- Next, WalkLoop obtains `mpFloorGetLeft(0, &pos)` and tests `cur_pos.x < pos.x`. Its local WalkWait entry helper changes state, calls the animation helper and clears only `self_vel.x`.
- Finally, if animation frames are exhausted, WalkLoop re-enters itself. These three checks are independent, sequential `if` statements. Neither spatial transition returns early; the final animation query observes the state after preceding calls. The code does not guarantee that a spatially selected state is the final state of this invocation.

Evidence: [phase implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwalk.c#L41-L158), [external WalkShoot entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandslap.c#L35-L46).

### Physics and other callback phases
All three IASA callbacks query the fighter's player slot and call `ftBossLib_8015BD20` only for numeric slot type zero. The callbacks themselves do not directly change motion state. The rendered `CrazyHand_IASA` name is not used to establish the callee's identity or full behavior.

WalkShoot and Walk2 physics delegate to `ft_80085134`. Independently read canonical code shows that helper assigning translation Z times facing direction to horizontal self-velocity, and translation Y to vertical self-velocity. WalkLoop performs that update and then overrides horizontal self-velocity with `x40_pos.z`, without an additional facing multiplier. All three collision callbacks are empty; this does not imply that the engine as a whole performs no collision processing.

Evidence: [callback families](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwalk.c#L19-L158), [shared velocity helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125).

### Return-path lifetime
WalkShoot animation exhaustion calls `ftMh_MS_389_80151018` in the Wait12 unit. That setup clears `mv.mh.unk0.x20`, constructs a destination from `x30_pos2.x/y` with Z forced to zero, assigns the wait selector, calls a wait-entry helper, then stores `ftMh_MS_341_8014FFDC` in `mv.mh.unk0.x4` and the destination by value in `mv.mh.unk0.xC`. The source explicitly assigns `Wait2_1` before testing for `Wait2_0`; this selector sequence must not be silently rewritten from the address-named function's numeric suffix. The visible else helper enters Wait1_2. Wait1_2 physics subsequently passes the retained destination and `x18` to the movement helper. Its collision callback, when `x18 == 0`, clears all self-velocity components and invokes the stored callback if non-null. The destination therefore outlives the local setup variable through a Fighter-field copy, and completion is deferred rather than performed by WalkShoot itself.

Evidence: [WalkShoot completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwalk.c#L19-L24), [wait-entry helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L19-L45), [retained destination and callback consumers/producers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L93-L138).

### Numeric helper and evidence limits
The local square-root helper uses `__frsqrte` and three refinements with double constants 0.5 and 3.0 when its input is positive, rounds through a volatile float, and otherwise returns the input unchanged. Its vector wrapper sums the squares of all three components. No compiled evidence was supplied to prove `.sdata2` membership, byte extent, ordering or exact emitted loads. Accordingly, the three section-attributed facts remain unresolved, despite visible source-level literal use.

Evidence: [numeric helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwalk.c#L75-L100).

### Review accounting
All 81 frozen facts were explicitly dispositioned: 78 retained and 3 unresolved. All 27 links were retained individually through explicit groups, including historical duplicate relationships; no merges or new links are proposed. All 32 subjects were enumerated, including the fifteen parameter subjects with no baseline facts.

Status: synthesized; independent review and live promotion pending.
