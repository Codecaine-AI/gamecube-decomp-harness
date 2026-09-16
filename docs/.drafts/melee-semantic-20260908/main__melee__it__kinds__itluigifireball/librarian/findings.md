# Luigi Fireball Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 133 source lines and 24 header lines read in canonical and rendered form. No parse errors. Source rendering made 13 hypothesis substitutions; header rendering made one. Rendered names were not evidence.

## Functionality

| Target | Behavior | Canonical Evidence |
|---|---|---|
| .data | One ItemStateTable record selects the animation, physics and collision callbacks for state 0. Section-wide placement beyond the named table is not inferred. | [lines 23–26](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L23-L26) |
| .sdata2 | Source contains zero literals and a square-root expression. Exact emitted section contents and addresses are unresolved without object evidence. | [lines 28–97](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L28-L97) |
| it_802C01AC | Builds SpawnItem from parent, position, kind and facing. Flattens previous-position Z, obtains pos through it_8026BB68, zeros velocity/damage, assigns both parent references. Only successful creation invokes initializer, db_80225DD8 and it_802750F8. | [lines 28–51](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L28-L51) |
| it_802C027C | Sets x velocity to special attribute x0_float times facing and zeros y/z. Supplies x4_float to the lifetime helper and selects state 0 with ITEM_ANIM_UPDATE. | [lines 53–61](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L53-L61) |
| itLuigifireball_UnkMotion0_Anim | Pre-decrements xD44_lifeTimer and returns whether the updated timer is <= 0. No literal initial lifetime is present. | [lines 63–68](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L63-L68) |
| itLuigifireball_UnkMotion0_Phys | Forwards gobj to Item_ApplyFallingPhysics. Shared inline reads falling-speed attributes and calls two common helpers; actual gravity depends on data. | [lines 70–73](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L70-L73) |
| itLuigifireball_UnkMotion0_Coll | Calls it_8026D9A0, then tests it_8027781C. If true, planar velocity magnitude below special attribute xC returns true before effects. Otherwise effect 1288 is used for It_Kind_Luigi_Fire and 1202 for every other kind. Returns false on remaining paths. | [lines 80–97](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L80-L97) |
| itLuigiFireball_Logic89_DmgDealt | Ignores gobj and returns true with no reads, writes or calls. | [lines 99–102](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L99-L102) |
| itLuigiFireball_Logic89_Reflected | Passes gobj unchanged to it_80273030 and forwards its bool. Ownership and velocity changes are not established by this wrapper. | [lines 104–107](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L104-L107) |
| itLuigiFireball_Logic89_Clanked | Ignores gobj and returns true with no reads, writes or calls. | [lines 109–112](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L109-L112) |
| itLuigiFireball_Logic89_HitShield | Ignores gobj and returns true with no reads, writes or calls. | [lines 114–117](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L114-L117) |
| itLuigiFireball_Logic89_Absorbed | Ignores gobj and returns true with no reads, writes or calls. | [lines 119–122](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L119-L122) |
| itLuigiFireball_Logic89_ShieldBounced | Forwards gobj and the return value through itColl_BounceOffShield. Exact trigger semantics are outside this wrapper. | [lines 124–127](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L124-L127) |
| itLuigiFireball_Logic89_EvtUnk | Passes gobj and referenced_gobj to it_8026B894 with no local guard or transformation. | [lines 129–132](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L129-L132) |
| src/melee/it/kinds/itluigifireball.c | Luigi fireball item TU with one state table, guarded spawn, initialization, lifetime/physics/collision callbacks and item-event adapters. | [lines 1–133](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L1-L133) |

The source-only calc_dist_2d_accurate helper at lines 75–78 computes the XY velocity magnitude used by collision. It has no frozen target identity. The header declares the public spawn/event API and the table. Static forward declarations at C lines 18–21 give the initializer and three state callbacks internal linkage despite definitions omitting static.

## Naming and Fact Decisions

Retain `itLuigiFireball_Spawn` and `itLuigifireball_Init` as behavior-based hypotheses, not attested original names. Clear the inherited `itLuigiFireball_Fly_Phys` alias in favor of the current canonical state callback name. Propose spawn parameter names `parent_gobj` and `previous_pos`; the latter preserves the distinction between SpawnItem.prev_pos and the separately populated pos. No function source names change.

Each of the 31 writable subjects is recorded in coverage.json. Each of the 73 current facts has its ID, update timestamp and explicit disposition in dispositions.json. Shared type ownership is deferred.

Dispositions: {'retain': 49, 'supersede': 0, 'reject': 1, 'unresolved': 23}. Seven proposal operations cover one alias clear, two parameter names and four parameter data-flow facts.

## Uncertainty

The owned callback bodies prove returned booleans and helper calls. Automatic destruction, terrain bounce mechanics, reflector ownership transfer and powershield event triggers require shared-engine review. The 50-frame lifetime, gravity immunity and exact .sdata2 contents depend on data or archival evidence not independently confirmed here. These facts remain unresolved instead of being accepted from old explanations.

Foreign canonical reads confirmed the life-timer setter, the falling-physics inline, and the Luigi caller arguments. They confer no shared-header ownership. All evidence uses the full pinned revision.

Source hashes and precise read ranges are recorded in coverage.json. The helper snapshots are under games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__it__kinds__itluigifireball/pages/.
