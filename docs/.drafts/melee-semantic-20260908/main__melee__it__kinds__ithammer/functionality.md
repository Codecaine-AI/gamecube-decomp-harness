## Hammer item behavior

This unit implements the world-item side of Hammer behavior, not the fighter's Hammer movement and attack states. Its six-entry table assigns animation, physics and collision callbacks; the header exposes the public lifecycle/helpers and table declaration.

- **State 0:** resting setup clears velocity and selects state 0. Animation returns false and physics is empty. Collision delegates floor-support maintenance and supplies the state-1 entry callback on support loss.
- **State 1:** ordinary falling state, selected at spawn, on support loss, and by Dropped. Spawn first sets `xD4C = 1`; Dropped uses transition mask `6`. Physics forwards fall acceleration and maximum-speed attributes. Collision uses full guarded landing handling when `xD4C != 0`, otherwise propagates the alternate floor-contact result.
- **States 2 and 3:** held states with a shared animation callback and null physics/collision slots. Pickup selects 2 and installs `it_80293D94` as the entered-hitlag hook. The animation callback requests state 3 whenever `xD4C == 0`, including repeated requests while already in state 3.
- **State 4:** has gravity physics and a collision callback returning the shared terrain-test result. No local entry routine selects it; identifying it as the Dropped state is incorrect.
- **State 5:** selected by EnteredAir, with inert animation/physics. Its terrain helper selects ordinary falling behavior on support loss or resting behavior when its supported-floor guard permits. The resting callback therefore is not exclusive to intact state-1 landings.

These relationships are established by [the table and callback bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammer.c#L38-L237), with [state-5 helper branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L750-L778) independently inspected.

## Head loss and cross-file lifetime

`it_80293DCC` performs an attribute-percentage chance test, then conditionally generates an attribute-bounded integer. It does not enforce positive or ordered bounds. The fighter stores the result in `x2330.y`; outside LightGet, a nonzero countdown advances only within the Hammer motion-state range. Expiration invokes `it_80293E34`. This fighter countdown is distinct from the item's `xD4C` head-presence/count field. See [generator](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammer.c#L67-L77) and [fighter consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_HammerWait.c#L104-L179).

Detachment decrements a positive `xD4C`, derives a normalized XY direction from joints 3 and 1, separates its horizontal sign into facing, and invokes the independent Hammer Head constructor. The constructor can fail allocation after the count has been consumed; no rollback occurs. The trailing visibility helper hides joint 3 whenever `xD4C <= 0`, including after failed creation. Negative values consequently satisfy hiding but not the held-animation exact-zero transition, while state-1 collision still treats them as nonzero. See [detachment](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammer.c#L51-L118) and [constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammerhead.c#L44-L73).

## Other semantics and name review

The hitlag callback requires `!xB && xA`; the shared helper additionally requires a fighter owner and writes item hitlag minus one to the owner's `dmg.x1958`. The existing SyncOwnerHitlag name is independently supported by [the helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L694-L700) and [fighter setter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L489-L493). The event callback is a branch-free two-pointer adapter; its precise triggering event remains unspecified locally.

Existing owned semantic names—Wait_Coll, Airborne_Enter, Airborne_Coll, Fall_Phys, GenerateHeadDropTimer, DetachHead and EnterResting—fit canonical behavior and are retained. Both rendered files parsed successfully; rendered substitutions were not treated as independent evidence. Shared callback names do not uniquely identify their table indices.

Gravity is threshold-guarded rather than hard-clamped: the common helper tests current sign/magnitude before subtracting acceleration, so an update can overshoot the threshold and existing excessive downward speed is not clamped. See [helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L176-L204).

No compiled artifact was supplied to establish constant-pool membership or section byte layout. Those uncertainties remain explicit rather than being inferred from source literals.

Status: synthesized; independent review and live promotion pending.
