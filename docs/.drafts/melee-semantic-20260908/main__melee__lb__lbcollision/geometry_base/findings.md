# Geometry Base Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reviewed all assigned lines 1-798 separately in canonical and proposed-name views. Read dependency lines 1985-2004 for the constant zero color. Source SHA-256 `59705ddc7a8a20fe40598b9e97251bb5cbd3f4ede890e3f6fa3ed5bc34dbd36b`.

## Function Behavior

### `lbColl_80005BB0`

Indexes lbColl_803B9880 by sfx_kind * 3 + sfx_severity and returns one lbAudioAx_80024184 call. Only kind 13 and severity 2 forward arg1; other combinations pass -1. The two middle audio arguments are 127 and 64. No bounds or null checks occur here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L232-L249

### `lbColl_80005C44`

Rejects a point outside the segment bounds expanded by the sum of two radii, then projects onto the 3D segment, clamps the parameter, writes arg3, and tests squared separation against squared combined radius. Approximately zero segment length selects parameter zero. Tangency returns true; broadphase misses do not write arg3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L251-L348

### `lbColl_80005EBC`

Computes a clamped projection onto a finite 3D segment, writes the scalar parameter through arg3, and returns squared distance to arg2. The division by squared segment length has no zero-length guard. The capsule solver uses it for endpoint candidates at lines 742-767.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L350-L390

### `lbColl_80005FC0`

Computes the corresponding XY-only segment projection and squared distance, writing arg3. It ignores Z in the geometry arithmetic, despite Vec3 value copies, and has no zero-length guard. Input pointers have no const qualifier but are not written.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L392-L428

### `lbColl_80006094`

Tests two 3D capsule axes using the combined radii. Expanded XYZ bounds reject before output writes. The solver handles a degenerate second segment, near-parallel axes via endpoint choice relative to the second midpoint, and general line parameters with endpoint fallback. It writes arg4 and arg5, then tests their squared separation; tangency returns true. No persistent state or callbacks occur.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L443-L797

## Names and Data

| Canonical Function | Retained Hypothesis |
| --- | --- |
| `lbColl_80005BB0` | `lbColl_PlayHitSFX` |
| `lbColl_80005C44` | `lbColl_CapsuleSphereIntersect` |
| `lbColl_80005EBC` | `lbColl_PointToSegmentDistanceSquared` |
| `lbColl_80005FC0` | `lbColl_PointToSegmentDistanceSquared2D` |
| `lbColl_80006094` | `lbColl_CapsuleCapsuleIntersect` |

All five names remain hypotheses. They describe current behavior; this review does not recover original names or rename source.

Declarations at code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L28-L228 contain 24 GXColor initializers with alpha 0x80, a 42-entry integer sound table, three color-pointer pairs, and seven packed byte arrays. The sound lookup is independently verified at lines 237-248. The purpose of lbColl_UnknownData remains unresolved.

The zero GXColor at code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1985-L1996 is copied into GXSetFog. C declarations and numeric literals do not independently prove linker section sizes or allocation. Focused dependency reads verify resource binding, palette pairing and pass selection. Section type descriptions drop exact byte counts; .sdata2 descriptions explicitly distinguish source literals from unverified section placement.

## Coverage and Dispositions

8 targets, 24 parameter entities, 40 existing facts. Dispositions: {'retain': 28, 'supersede': 12}. 43 proposed writes refresh full-revision evidence, narrow two audio assertions, and add three output/degeneracy descriptions. No entity, merge, link, or follow-up mutations.

Each parameter entity is accounted for individually in coverage.json. They have no baseline facts. Declaration order supports their semantic roles; the #rN suffix alone does not establish physical PowerPC register allocation.

The planar helper caller claim is confirmed by dependency lines 1049-1101. Shared structure layouts and audio callee internals remain family followups. The complete per-fact IDs, updated_at versions, values and decisions are in fact-dispositions.json. Immutable canonical and rendered page paths and parse metadata are in coverage.json.

No shared KB, source, matching, Git, or UI changes. Draft proposals require independent review before parent application.

## Focused Dependency Evidence

- Sphere and cylinder resource consumption: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2050-L2176
- Hurt-state color pairing and alpha pass selection: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2462-L2506
- HitResult color pairs and alpha pass selection: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2582-L2650
- Planar endpoint fallback: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1049-L1115
- Contact distance, square-root coefficients and quadratic contact helper: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1357-L1549

All existing facts now have retain or supersede decisions. Specialized HitResult category labels are removed from the palette game mapping until canonical caller evidence establishes them. Exact data-section extents, numeric-literal section placement and the auxiliary byte array remain unresolved questions, not unresolved promoted assertions.

## Parallel-Axis Limitation

The approximately parallel branch chooses the first-axis endpoint nearer the second-axis midpoint and projects it onto the second axis. This is an endpoint heuristic, not a universal closest-pair solution: collinear first axis [0,100] containing second axis [40,60] selects points 100 and 60 under the strict midpoint-distance tie comparison, giving separation 40 despite overlapping axes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L649-L720

Final helper dry-run validated 43 writes with zero rejected items. Receipt directory: `games/melee/state/knowledge_v2/semantic-sweep-20260908/validation/d1206b51dbe148eb6eadf3bc561417566dabecea8b1939afd91ab1e2eb95895e`. No apply ran.
