# Capsule Geometry Review

Local review complete at `c302741689bd67c361cd7faadb221df3193992c3`. Proposal validation is separate from independent approval. No shared KB or source changes were made.

## Scope and Evidence

Reviewed all 751 assigned canonical lines and their separate rendered reading views, c799–1549, plus supplemental caller evidence c1550–1688. The four assigned pages are 799–978, 979–1158, 1159–1338 and 1339–1549. `coverage.json` records immutable page artifacts, hashes, reader receipts, rendering metadata and all 33 assigned subjects. No header was assigned to this leaf. The TU lead owns header coverage.

Source SHA-256 is `59705ddc7a8a20fe40598b9e97251bb5cbd3f4ede890e3f6fa3ed5bc34dbd36b`. Rendering used the frozen baseline with zero parse errors. Names in the reading view were hypotheses. Every retained name below has an address-based canonical symbol, so none is an attested original name.

## Naming Decisions

| Canonical | Existing hypothesis | Decision |
|---|---|---|
| lbColl_800067F8 | lbColl_TestCapsuleOverlap2D | Retain with explicit Z-dependence caveat. |
| lbColl_80006E58 | lbColl_CheckCapsuleCollision3D | Retain as descriptive hypothesis. |
| lbColl_800077A0 | lbColl_CalcCapsuleSphereContact | Retain; this calculates geometry with an unrestricted line parameter. |

`fact-dispositions.json` records all 18 fact IDs, updated-at versions and decisions. Three names are retained and 15 semantic summaries are superseded. All 18 proposed writes refresh full-revision citations. No existing fact is silently dropped.

## Behavior

`lbColl_800067F8` accepts endpoints a/b and c/d, output points e/f and radius contributions p/q. Radius-expanded XY bounds reject before either output is written. The remaining solver uses planar dot products, degeneracy handling and endpoint fallback. It writes interpolated XY with zero Z and accepts equality in the final squared-distance comparison.

The inherited description “restricted to X and Y” is too strong. The parallel branch chooses an endpoint by distance to the second axis midpoint in XY, then projects using XYZ dot products. Nonzero input Z can change the selected parameter. Even for planar inputs this branch is an endpoint heuristic; this review does not claim mathematically exact closest points for every overlapping parallel segment configuration. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L972-L1033 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1080-L1102.

`lbColl_80006E58` expands XYZ bounds by hit_radius + hurt_radius*broadphase_scale. After axis solving it writes hit_closest and hurt_closest. Approximately coincident points immediately succeed, writing the hit point as contact and the unscaled radius-sum margin. Otherwise the inverse hurt matrix transforms the candidate points and supplies a direction-dependent effective hurt radius: hurt_radius*world_distance/local_distance. Contact and overlap are written before the final test, including a final miss. The body checks neither inversion success nor transformed zero distance. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1397-L1444.

The shield wrapper passes one position as both hurt endpoints; the enabled-hurt wrapper passes two positions. Both consume contact and overlap into the hit capsule. This is direct combat geometry evidence without making claims about external structure layout. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1612-L1624 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1682-L1685.

`lbColl_800077A0` gets a world radius from the distance between transformed local X-radius and transformed origin. It adds dist_offset for a line/sphere quadratic, clamps a negative discriminant to zero and uses the lower root. The parameter is never clamped to [0,1], and the function returns no hit/miss result. It normalizes the center-to-candidate direction into e, calls lbVector_AngleXY for the angle, and writes d on the unexpanded sphere radius. Exactly equal endpoints set angle to pi and e to zero while leaving d untouched. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1484-L1548.

The “after overlap” ordering and fighter-specific shield claim are not established inside this leaf's caller evidence. The local wrapper supplies HitResult and HitCapsule geometry and discards the surface point while retaining direction/angle. Those narrower facts replace the inherited game mapping. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1627-L1648.

## Parameters and Inline Helpers

| Function | Source parameter roles |
|---|---|
| 800067F8 | a/b first axis; c/d second axis; e/f outputs; p/q summed radius contributions. |
| 80006E58 | Four endpoints, two closest-point outputs, hurt transform, contact output, overlap output, two radii and broadphase scale, in the canonical signature order. |
| 800077A0 | a center; arg1 transform; b/c axis; d surface output; e direction output; angle output; x local X radius; dist_offset expansion. |

All 30 parameter entity subjects were read and have zero facts. They use #rN locators without source names. In particular 800067F8 has nine entity locators but only eight source parameters. No register-to-source mapping is invented. Coverage records each entity individually as reviewed with unresolved mapping. Semantic source roles remain function-level facts.

Canonical inline names are retained without new KB identities. lbColl_GetY returns v.y; lbColl_DifferenceY returns a.y-b.y. sqrDistance returns XYZ squared distance. sqrtf_store refines reciprocal square root three times for positive x, stores the resulting float through the volatile pointer and returns it; nonpositive x returns unchanged without a store. The call with `sqrt_tmp - 1` is visible canonical stack-spill accommodation, not a new safety or portability claim. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L799-L807 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1446-L1465.

## Remaining Review

Independent review must approve the refreshed facts and retained aliases. Family followups in `coverage.json` defer Fighter_x1614_t pickup interpretation and fighter-specific HitResult shield identity. External Vec3, matrix, HitResult and capsule layouts are not claimed by this leaf. Entities, merges, links and follow_ups are empty in the proposal envelope.

Dry-run validation passed with 18 accepted writes, zero rejected and zero skipped. Proposal SHA-256: `7f729e7afc36ff4e02028340cb9adcd7808b043e1b72d6ae641c6db7496a5737`. The helper reported simulated applied counts; no KB application occurred.
