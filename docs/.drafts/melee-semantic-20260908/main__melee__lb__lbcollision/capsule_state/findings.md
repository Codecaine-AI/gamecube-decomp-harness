# Capsule State Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Local review covers source lines 1550–1986 and every header line 1–123. Canonical/rendered snapshots and SHA-256 hashes are recorded in coverage.json.

## Behavior and Naming

Each subsection accounts for one target. Parameter entities and their empty fact inventories are individually recorded in coverage.json. Parameter locator ordinals are not proof of PPC register allocation.

### lbColl_80007AFC

Derives each HitCapsule radius from scale, multiplying by its supplied scale only when x43_b1 is clear. Returns lbColl_80006094 with b endpoints before a endpoints and each hurt_coll_pos supplied as an output.

Canonical parameters: a, b, x, y. Inherited alias: lbColl_HitCapsuleIntersect. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1550-L1568

### lbColl_80007B78

Adapts Mtx-backed geometry and Fighter_x1614_t to lbColl_800067F8. Passes b.x14/b.x8 and a[1][1]/a[0][2] as Vec3 addresses, b.x20 and a[1][4] as output addresses, and b.x0*y and a[0][0]*x as sizes. Returns the helper result.

Canonical parameters: a, b, x, y. Inherited alias: lbColl_CheckFighterPickupCollision. Defer inherited name pending caller/callee evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1570-L1575

### lbColl_80007BCC

Updates HitResult.pos through lb_8000B1CC only when skip_update_pos is clear, optionally sets its Z, and marks it cached. Nonzero arg3 writes that position and zero coll_distance to the hit capsule and returns true. Otherwise selects the bone matrix or its concatenation with arg2 and delegates to lbColl_80006E58 with equal hurt endpoints, conditional hit-radius scaling and 20*arg5.

Canonical parameters: arg0, shield_hit, arg2, arg3, arg4, arg5, arg6. Inherited alias: lbColl_TestHitCapsuleHitResult. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1577-L1625

### lbColl_80007DD8

Selects the HitResult bone matrix or its concatenation with hit_transform, derives the attack radius according to x43_b1, and calls lbColl_800077A0 with hit.pos, hit.size and capsule endpoints. Forwards arg3 and angle as outputs and discards a temporary Vec3 result.

Canonical parameters: capsule, hit, hit_transform, arg3, angle, scale. Inherited alias: lbColl_CalcShieldHitDirection. Defer inherited name pending caller/callee evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1627-L1648

### lbColl_80007ECC

Returns false unless hurt state is exactly HurtCapsule_Enabled. Updates uncached hurt endpoints, optionally replaces both Z values, selects the bone or concatenated matrix, and calls lbColl_80006E58 with conditional hit-radius scaling, hurt.scale, and 3*hurt_scl_y; hit hurt_coll_pos and coll_distance are output destinations.

Canonical parameters: arg0, arg1, arg2, hit_scl_y, hurt_scl_y, hurt_pos_z. Inherited alias: lbColl_CheckEnabledHitHurtCollision. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1650-L1688

### lbColl_8000805C

Rejects HurtCapsule_Intangible before updating positions. For other states caches endpoint transforms and optional Z replacement. Nonzero arg3 forces success with the hurt midpoint and coll_distance=5; otherwise delegates to lbColl_80006E58 with conditional hit-radius scaling and 3*arg5.

Canonical parameters: arg0, arg1, arg2, arg3, arg4, arg5, arg6. Inherited alias: lbColl_CheckHitHurtCollision. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1690-L1736

### lbColl_80008248

Tests hit and hurt geometry through lbColl_80006E58 without reading hurt.state. Refreshes uncached hurt endpoints, optionally replaces Z and concatenates matrices, chooses scaled or intrinsic hit radius, and supplies 3*arg4 as the final argument. No forced-success branch exists.

Canonical parameters: arg0, arg1, arg2, arg3, arg4, arg5. Inherited alias: lbColl_CheckHitHurtCollisionIgnoreState. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1738-L1773

### lbColl_800083C4

Returns immediately when skip_update_pos is set. Otherwise calls lb_8000B1CC for both bone-relative endpoint offsets and sets skip_update_pos true.

Canonical parameters: arg0. Inherited alias: lbColl_UpdateHurtCapsulePositions. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1775-L1784

### lbColl_80008428

Unconditionally writes HitCapsule_Disabled to the supplied capsule state and touches no other capsule field.

Canonical parameters: arg0. Inherited alias: lbColl_DisableHitCapsule. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1786-L1789

### lbColl_80008434

Unconditionally writes HitCapsule_Enabled to the supplied capsule state and touches no other capsule field.

Canonical parameters: arg0. Inherited alias: lbColl_EnableHitCapsule. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1791-L1794

### lbColl_80008440

Clears victim pointers in both victim tables and resets x44 and x45 to zero. Leaves each entry x4 value untouched and does not test capsule state.

Canonical parameters: hit. Inherited alias: lbColl_ClearHitCapsuleVictims. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1796-L1807

### lbColl_CopyHitCapsule

Copies both arrays of HitVictim records from src to dst using the victims_1 array bound, then copies x44 and x45. No other capsule fields are assigned; the canonical name denotes a selective victim-history transfer.

Canonical parameters: src, dst. Inherited alias: none. Keep canonical name; no redundant inferred-name fact.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1809-L1822

### lbColl_80008688

Registers an opaque victim identity in victims_1. Duplicates return false and refresh x4 from x40_b4 only for types 2,4,5,7,8. New identities use the first null entry or x44 when full; other types initialize x4 to zero. Only full-table insertion advances x44, wrapping at 12, and insertion returns true.

Canonical parameters: capsule, type, victim. Inherited alias: none. New candidate lbColl_RegisterHitCapsuleVictim1.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1824-L1877

### lbColl_80008820

Registers an opaque victim identity in victims_2. Duplicates return false and refresh x4 from x40_b4 only for types 2,5,7,8. New identities use the first null entry or x45 when full; other types initialize x4 to zero. Only full-table insertion advances x45 with ARRAY_SIZE wrap, and insertion returns true.

Canonical parameters: capsule, type, victim. Inherited alias: lbColl_RegisterHitCapsuleVictim2. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1879-L1930

### lbColl_800089B8

Clears every victims_1 victim pointer equal to arg1. Continues after matches and leaves entry x4, x44, victims_2 and capsule state untouched.

Canonical parameters: hit, arg1. Inherited alias: lbColl_RemoveHitCapsuleVictim1. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1932-L1940

### lbColl_80008A5C

For any state other than HitCapsule_Disabled, decrements nonzero x4 in occupied entries of both victim tables and clears a victim pointer when its countdown reaches zero. Empty entries and occupied zero-countdown entries are unchanged.

Canonical parameters: hit. Inherited alias: lbColl_DecHitVictimTimers. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1942-L1969

### lbColl_80008D30

Copies state, damage, kb_angle, element, sfx_severity and sfx_kind from the descriptor; maps unkC/unk10/unk14 to x24/x28/x2C and also assigns descriptor damage to unk_count. Leaves geometry and victim history untouched.

Canonical parameters: arg0, arg1. Inherited alias: lbColl_SetHitCapsuleParams. Retain descriptive hypothesis; original spelling remains unknown.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1971-L1983

## Header and Non-target Lines

Header lines 1–18 contain guards, includes and forward declarations. Lines 20–77 declare the collision functions, including canonical CopyHitCapsule source-before-destination ordering at line 51. The header adds no shared-type definitions. ApproximatelyZero uses strict -0.00001 < x < 0.00001 at lines 79–90. testPlusX and testPlus reject only when a+offset is below both comparison values at lines 92–110. testMinusX rejects only when a.x-offset is above both at lines 112–120. Equality passes these plus/minus tests. These four inline names have no manifest target identity, so no entity is invented. Lines 122–123 close the guard. Source line 1985 defines zero-initialized GXColor lbColl_804D7A50; section-level ownership remains with the TU lead.

Header evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.h#L1-L123

## Corrections and Uncertainties

CopyHitCapsule copies only two victim tables and two cursors. The existing SetHitCapsuleParams name rationale calls it a full copy; the proposal retains the candidate and replaces that rationale. The hit-capsule overlap wrapper passes mutable contact outputs despite its old stateless wording. Timer aging accepts every non-disabled state, broader than exact Enabled.

The first victim table refreshes type 4; the second does not. A null victim is not checked before duplicate detection and can match an empty slot. Metadata zero means no countdown in the aging routine, not immediate expiration. The cache guard also gates Z replacement: a later caller with a different plane receives the already cached positions. Callers must invalidate those caches; no invalidation owner is established here.

No callback is invoked directly. The wrappers delegate through lb_8000B1CC, HSD_JObjGetMtxPtr, PSMTXConcat and collision geometry helpers. Their internal callbacks or exact algorithms are outside this cluster. No external shared-type claims are proposed.

Pickup-specific and shield-direction names remain unresolved because their caller or lower-level algorithm evidence was not reread here. Exact HitVictim layout, enum families and opaque token/register types remain family work. All 99 existing fact IDs and updated_at versions have explicit decisions in fact-dispositions.json.

Dispositions: {'retain': 55, 'unresolved': 25, 'supersede': 19}. Proposal has 21 facts, empty links/entities/merges/follow_ups.

Dry-run validation accepted all 21 facts with zero rejections. No shared KB changes were applied.
