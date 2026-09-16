# Mario Fireball Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete canonical and rendered reads cover C lines 1–133 and H lines 1–26. Both renders succeeded with zero parse errors. C contains 12 substitutions, H contains 3; none serve as semantic evidence.

Covered all 31 writable subjects: 14 targets, 16 parameter entities and 1 file entity. Reviewed all 76 facts: {'retain': 57, 'unresolved': 13, 'supersede': 6}. There are 13 source functions, including the source-only `calc_dist_2d_accurate`. No shared type ownership is claimed.

## Functionality

### `.data`

Contains authored it_803F6788, one ItemStateTable entry with leading animation ID 0 and animation/physics/collision callbacks. Its array index is state 0; initializer selects that index.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L18-L21.

### `.sdata2`

Report section identity is inventoried. Owned C uses zero literals and a square-root helper, but section extent and exact compiler literal membership cannot be established from source alone.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L23-L97.

### `itMarioFireball_Logic87_Absorbed`

Ignores object and returns true unconditionally; no local side effects.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L119-L122.

### `itMarioFireball_Logic87_Clanked`

Ignores object and returns true unconditionally; no local side effects.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L109-L112.

### `itMarioFireball_Logic87_DmgDealt`

Ignores object and returns true unconditionally; no local side effects.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L99-L102.

### `itMarioFireball_Logic87_EvtUnk`

Passes gobj and referenced_gobj unchanged to it_8026B894. Specific event meaning remains unresolved; rendered helper alias is not evidence.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L129-L132.

### `itMarioFireball_Logic87_HitShield`

Ignores object and returns true unconditionally; no local side effects.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L114-L117.

### `itMarioFireball_Logic87_Reflected`

Returns it_80273030(gobj) unchanged. Foreign helper reverses and scales X/Y velocity by xC70, reverses facing, resets lifeTimer from halfLifeTimer and returns false.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L104-L107.

### `itMarioFireball_Logic87_ShieldBounced`

Returns itColl_BounceOffShield(gobj) unchanged. Foreign helper mirrors velocity about xC58, conditionally updates facing, updates collision facing and returns false.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L124-L127.

### `itMariofireball_UnkMotion0_Anim`

Decrements xD44_lifeTimer before testing it; returns true at zero or below, otherwise false.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L61-L66.

### `itMariofireball_UnkMotion0_Coll`

Calls it_8026D9A0, then it_8027781C. The latter mutates velocity on qualifying surface collision. When it returns true, compares the resulting XY speed with special attribute x10. Strictly lower speed returns true before feedback. Otherwise Mario Fire calls Item_8026AE84 and spawns effect 1147; every other kind takes effect 1184. Returns false on remaining paths.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L78-L97.

### `itMariofireball_UnkMotion0_Phys`

Forwards the object to Item_ApplyFallingPhysics without local branches or state writes.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L68-L71.

### `it_8029B6F8`

Builds SpawnItem from parent, requested previous position, kind and facing. Forces previous Z and initial velocity to zero, gets current spawn position from it_8026BB68, sets both parent fields, and calls Item_80268B18. Unconditionally initializes the result and calls db_80225DD8 and it_802750F8; no null-result guard exists.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L23-L44.

### `it_8029B7C0`

Reads special attributes x0_float as launch speed and x4_float as angle in radians. Writes velocity as facing*speed*cos(angle), speed*sin(angle), 0. Passes x8 to the lifetime helper and enters state 0 with ITEM_ANIM_UPDATE.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L46-L59.

### `calc_dist_2d_accurate`

Returns sqrtf_accurate(VEC2_SQ_LEN(*v)) as double; this local helper measures XY speed for the collision cutoff.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L73-L76.

## Naming Decisions

| Canonical | Existing Hypothesis | Decision |
|---|---|---|
| .data | itMarioFireball_StateTable | retain existing inferred alias as hypothesis; canonical symbol unchanged |
| .sdata2 |  | retain section label; do not invent a gameplay table name |
| itMarioFireball_Logic87_Absorbed |  | retain canonical; no new alias |
| itMarioFireball_Logic87_Clanked |  | retain canonical; no new alias |
| itMarioFireball_Logic87_DmgDealt |  | retain canonical; no new alias |
| itMarioFireball_Logic87_EvtUnk |  | retain canonical; no new alias |
| itMarioFireball_Logic87_HitShield |  | retain canonical; no new alias |
| itMarioFireball_Logic87_Reflected |  | retain canonical; no new alias |
| itMarioFireball_Logic87_ShieldBounced |  | retain canonical; no new alias |
| itMariofireball_UnkMotion0_Anim |  | retain canonical; no new alias |
| itMariofireball_UnkMotion0_Coll |  | retain canonical; no new alias |
| itMariofireball_UnkMotion0_Phys | itMarioFireball_Fly_Phys | clear Fly alias; retain descriptive canonical state-0 physics name |
| it_8029B6F8 | itMarioFireball_Spawn | retain existing inferred alias as hypothesis; canonical symbol unchanged |
| it_8029B7C0 | itMarioFireball_Init | retain existing inferred alias as hypothesis; canonical symbol unchanged |

## Dependencies and Uncertainty

Foreign context was read only to verify shared helper behavior. `coverage.json` records every foreign path and range. The lifetime helper sets the life timer and a scaled half-life timer. The map helper changes velocity before returning true, so the collision cutoff measures post-response speed. The state-change helper reads the record first member as anim_id; state selection uses the array index. These observations support local claims without assigning shared fields or types.

The callback constant true is attested; engine-level removal and event eligibility depend on dispatchers not reviewed here. The else effect branch accepts every non-Mario kind locally and does not identify a unique alternate fighter projectile. Mario spawn has no null guard after creation. Header line 22 uses Item_GObj* where C line 129 spells HSD_GObj* for the second event argument; resolve alias equivalence in the shared-type family review.

The .sdata2 claims remain unresolved because canonical C does not prove pool size or exact membership. Neutral-special hand/release caller claims also remain unresolved. No source or KB changes were made.

All fact IDs, timestamps and original values are in `dispositions.json`; the helper does not expose integer versions. All 16 parameter entities have no existing facts and receive explicit role reviews in both JSON review artifacts.

Dry-run valid: 8 accepted, 0 rejected. Proposal SHA-256 `3a5b0b5cf3cd1fda644e9f148460bb01f8a7a4d3807e0f8815b921314b5f4541`. Proposal includes six corrections or clears and two retained-name evidence refreshes.
