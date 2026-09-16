## Scball item implementation

This unit implements the item-side lifecycle and motion callbacks associated by the frozen baseline with Melee's Screw Attack item. It does not implement the holder's jump action or the victim's forced fighter action locally.

### State dispatch

`it_803F6220` contains five source-level state descriptors:

| State | Entry and behavior |
|---|---|
| 0 | Resting/grounded entry resets all three velocity components, calls `it_8026B390`, then selects state 0 with `ITEM_ANIM_UPDATE`. Animation returns false; physics is empty. Collision delegates to `it_8026D62C` with the state-1 entry callback. |
| 1 | Spawn enters through `it_80294B58`; drop selects this state directly with flags 6. Physics passes the item's fall-speed attributes to `it_80272860`. Collision supplies the resting entry callback to `it_8026E15C`. |
| 2 | Pickup selects this state with `ITEM_ANIM_UPDATE`. Only its false-returning animation callback is installed; physics and collision slots are null. |
| 3 | Throw selects this state with flags 6. Its animation index is 0, unlike the other rows' -1. Physics calls `Item_ApplyFallingPhysics`; collision supplies the same resting continuation used by state 1. |
| 4 | `EnteredAir` selects this distinct state with `ITEM_ANIM_UPDATE`. Animation returns false and physics is empty. Collision passes resting and falling entry callbacks to `it_8026E8C4`. It should not be collapsed into ordinary falling state 1. |

The shared state machinery installs the selected row's callbacks. An animation index of -1 removes animation resources and clears the script pointer, so requesting `ITEM_ANIM_UPDATE` is not itself proof of an active animation resource. [State table and callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itscball.c#L28-L142), [shared dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1180-L1241).

### Collision branches and lifetime boundaries

The state-0 shared helper refreshes collision-derived position and, when supported, floor identity. Loss of support invokes the falling continuation. Its supported branch also conditionally calls `Item_8026ADC0` when `it_80277544(gobj) != 0` and `xDCD_flag.b3` is clear; therefore the existing explanation that support simply preserves state 0 is incomplete. [Grounded helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L44-L70).

The state-1 and state-3 landing continuation is guarded inside `it_8026E15C`; collision does not unconditionally enter state 0. The helper tests collision bits and additional predicates before invoking the supplied callback. [Landing helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L459-L479).

For state 4, failed support testing invokes the falling continuation and returns. With support, the helper performs additional processing and invokes resting entry only when the low bit of `xDC8_word.flags.x1F` is clear or `xD5C` is zero. Otherwise neither supplied continuation is invoked. [State-4 helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L750-L778).

All local animation and motion-collision callbacks return false, but this is not an object-lifetime guarantee. Shared animation processing has a separate lifetime-expiration path, and shared movement remains active independently of an empty state-specific physics callback. The thrown falling inline also calls `it_80274658` after applying attribute-driven falling, unlike state 1's direct single-helper call. [Shared lifetime processing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1280-L1319), [shared movement](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1353-L1400), [falling inline](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/inlines.h#L41-L46).

### Combat callbacks

Damage-dealt and clanked callbacks ignore their argument and return true. Reflection forwards `it_80273030`'s result unchanged. Shield contact calls `itColl_BounceOffVictim` and returns false. These wrappers do not locally implement fighter effects or establish the full meaning of the shared reflection result. [Combat bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itscball.c#L144-L163).

### Semantic assessment

The rendered Grounded, Fall, PickedUp, Thrown, EnterResting, and EnterFall names fit the canonical state associations and are retained as semantic hypotheses, not recovered original spellings. Both owned rendered files are clean. Existing useful descriptions and all baseline links are explicitly retained in the checkpoint ledger except for the identified grounded-state correction and four unresolved compiled-storage claims. Source evidence does not establish section placement or compiled byte layout.

Status: synthesized; independent review and live promotion pending.
