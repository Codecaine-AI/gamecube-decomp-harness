## Box / Crate runtime

The unit implements nine Box state-table rows, ordinary Crate lifecycle events, weighted opening outcomes, and a Kongo-stage parent-following form. The header declares the same callback surface and state table.

| Row | Canonical behavior |
|---|---|
| 0 | Resting: velocity-reset entry, lifetime-threshold effect callback, empty physics, floor-support maintenance and alignment. |
| 1 | Ordinary fall: gravity helper; parent-associated Boxes additionally damp depth velocity and integrate stored X/Y rotation increments. Landing uses a shared, guarded collision resolver. |
| 2 | Held: selected by pickup; inert animation and physics, NULL collision callback. |
| 3 | Thrown: shared falling physics; ordered floor-opening, ceiling-clamp, then wall-opening tests. |
| 4 | Dropped: shared falling physics; qualifying collision opens only when absolute vertical speed is strictly above the configured threshold, otherwise resets velocity and settles into row 0. |
| 5 | Alternate entered-air terrain reconciliation: inert animation/physics, shared collision processing with guarded resting or falling successors. |
| 6 | No-normal-content opening outcome: initializes shared lifetime processing; animation callback decrements xD44_lifeTimer through it_802751D8. Physics and collision are inert. |
| 7 | Content-release aftermath: hides the model, clears planar velocity, marks opened, and initializes the private despawn timer to 40. Its animation callback decrements before testing completion. |
| 8 | Parent-following form: inert animation/collision and bounded randomized X/Y tumbling. A separately installed accessory callback follows the retained parent's translation and can enter row 1. |

Damage-dealt, clank, shield-hit and reflection callbacks share an opened==0 guard and opening resolver. Damage-received additionally requires xC9C >= damage_threshold. The resolver emits effect 0x427 and performs a Boolean weighted outcome roll. The content branch subsequently performs a separate count roll: it first attempts two exceptional content paths, then selects one, two or three ordinary items. Its fourth argument bounds an independent special-flag roll, rather than contributing to the ordinary count-weight sum. The Boolean outcome roll does not preserve an item count, and the opening initializer does not verify successful content allocation.

The Kongo caller supplies a Ground object to the special Box spawn routine and cleans it up if Box creation fails. Successful creation retains that object in box.spawned_gobj, seeds rotational increments, and enters row 8. The accessory callback always copies a present parent's translation; only nonnegative target z also transfers displacement into velocity and enters row 1. A missing parent enters row 1 without assigning position or velocity. The retained reference is not cleared by these local release branches; destruction forwards it to grKongo_801D8058 and then clears it. Global callback-reset and parent-invalidation behavior should not be inferred solely from this unit.

## Semantic review

Supported existing names are retained. In particular, Thrown_Coll and Dropped_Coll agree with explicit state selections despite canonical comments reversing those descriptions. Thrown_Phys is shared by rows 3 and 4, an ambiguity already preserved in its baseline rationale. Numeric naming remains appropriate for less-specific setup and transitional callbacks.

Corrections distinguish the resting callback's timer-gated effect from a beginning-of-lifetime sound, collision-normal alignment from a different floor-index-based helper, the upright-contact predicate's auxiliary-vector/xD5C writes from its caller's velocity reset, and planar stopping from a guarantee of complete immobility. State 6 and state 7 retain distinct expiration mechanisms even though both initialize box.despawn_timer to 40.

All owned canonical and rendered pages, all 103 subjects, all 265 facts and all 85 links were reviewed. The ledger retains 246 facts and 84 links, supersedes 11 facts, and leaves eight compiled-section facts plus one section link unresolved. No compiled section size, placement or complete-layout claim is established by source literals alone.

Status: synthesized; independent review and live promotion pending.
