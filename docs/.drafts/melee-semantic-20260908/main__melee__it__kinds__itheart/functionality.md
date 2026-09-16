## Heart Container implementation

The unit implements Heart Container creation, configured healing payloads, tracking cleanup, model presentation and five physical item states. The header exposes the constructor, alternate-heal setter, lifecycle handlers and state table; motion callbacks and transition helpers are private. Healing is configured here, but the pickup callback does not itself modify fighter damage.

### Creation and tracking lifetime

`it_80283AE4` returns NULL when its first object argument is NULL or common creation fails. That argument is only a creation guard: it is not passed as the spawned item's parent. `Item_InitSpawnOnPlane` receives NULL parent, the requested position and facing -1; its canonical implementation forces position z to zero and initializes a parentless spawn descriptor. Successful creation marks `heart.xDD8.b0`, stores the supplied index in `heart.xDDC`, and calls the camera-box removal helper. Camera removal itself requires both its flag and camera pointer to be present.

Normal spawn initializes x/z velocity to zero, y velocity from `HeartContainerAttr.x14`, healing from `x0_heal`, and tracking fields to false/zero before selecting state 1. Special dispatcher case 8 calls the constructor and, on a successful Heart result, replaces healing from `x4.flags` through `it_80283BD4`. Dispatcher case 9 also contains a returned-kind Heart branch using this setter; the setter is not intrinsically exclusive to case 8. Destruction clears `gm_80473A18.x90[index]` only for marked instances. Neither index assignment nor destruction locally checks the index's bounds.

Evidence: [creation and cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheart.c#L40-L88), [plane initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/inlines.h#L253-L266), [special dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L889-L925), [camera removal](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L268-L280).

### State dispatch

| Index | Entry and behavior |
|---|---|
| 0 | Grounded entry performs shared setup and clears all velocity. Animation adds `x18` to the first child model's Y rotation; item-specific physics is empty. Collision supplies the state-1 selector on support loss. |
| 1 | Normal falling entry, selected after spawn or support loss. Shares all three callbacks with index 3. |
| 2 | Pickup reveals the child hierarchy, resets the selected child's Y rotation and selects this row. Animation returns false, physics is empty and collision is NULL. |
| 3 | Drop performs shared setup, reveals the child hierarchy, resets Y rotation and selects this row with numeric flags 6. Its rotating animation, falling physics and landing collision callbacks are shared with index 1. |
| 4 | Explicit EnteredAir selects the fifth table row. Animation returns false and physics is empty; collision can select grounded index 0 or falling index 1, with a supported-floor branch that can defer either transition. |

All rows contain animation ID `0xFFFFFFFF`. Consequently, the common state changer's animation-ID -1 branch removes model animations and clears the script pointer, even when `ITEM_ANIM_UPDATE` is requested. It still installs the selected animation/physics/collision callbacks. A state-change flag must not be mistaken for proof that animation data is actually installed.

Evidence: [table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheart.c#L28-L38), [state bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheart.c#L90-L188), [common state changer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1180-L1242).

### Delegated behavior and exceptional branches

The falling physics wrapper forwards the common fall acceleration and maximum-speed attributes. The callee tests velocity/acceleration signs and current speed magnitude before subtracting acceleration; it does not strictly clamp the resulting velocity to the threshold. Empty item-specific physics callbacks likewise do not prove that common engine movement is disabled.

Grounded collision updates position and floor metadata, invokes leave-ground setup and the state-1 callback when support disappears, and has an additional supported-floor branch calling `Item_8026ADC0` when its predicate and flag guard permit. Falling collision invokes grounded entry only after its floor-bit and landing predicates succeed. State-4 collision immediately selects falling on no floor; with support it performs additional processing and selects grounded only when bit 0 of `x1F` is clear or `xD5C` is zero. Thus a supported state-4 item can remain in state 4. The Heart collision wrappers always return false, but that result is not a guarantee against lifetime effects elsewhere in the engine.

The rotation inline asserts a non-NULL joint, adds to Y rotation and conditionally marks the transform dirty. It has no quaternion-mode assertion in this revision. Visibility clearing recurses through children but stops below `JOBJ_INSTANCE` joints; resetting Y does not reset X or Z orientation.

Evidence: [fall physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L176-L204), [grounded collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L44-L70), [landing predicates](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L450-L479), [state-4 branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L750-L778), [rotation inline](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L616-L623), [visibility recursion](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1032-L1043).

### Reference cleanup and naming assessment

`itHeart_Logic8_EvtUnk` forwards both objects to the common relationship cleaner and discards its owner-match result. Matching owner, reflector, absorber, primary/secondary fighter and toucher references are cleared; clearing the primary fighter reference also sets source player to 6. The global caller caches the old owner before invoking item callbacks, preserving its subsequent owner-dependent handling.

The existing rendered names `itHeart_Spawn`, `itHeart_SetSpecialHealAmount`, `itHeart_PickedUp_Anim`, `itHeart_Fall_Coll` and `itHeart_EnterFallingState` fit canonical behavior. `itHeart_UnkMotion0` is compatible but meaningfully less informative than the proposed `itHeart_EnterGroundedState`. Two explanations warrant correction: state index 4 is the fifth row, and explicit EnteredAir must not be conflated with ordinary support loss or dropping. The header renderer leaves the constructor unchanged with `shadowed_binding`; this is a rendering inconsistency, not contradictory source evidence.

Evidence: [Heart adapter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheart.c#L190-L193), [global caller and cleaner](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L466-L525).

### Review outcome

All 49 subjects, 125 facts and 40 links were assessed. The checkpoint ledger explicitly retains 115 facts and all 40 links; three facts are superseded and seven remain unresolved. Source-level table and literal-consumer knowledge is retained without endorsing compiled section size, padding, placement or exclusivity claims.

Status: synthesized; independent review and live promotion pending.
