# Debug Drawing Review

Draft, pending independent review. Revision `c302741689bd67c361cd7faadb221df3193992c3`. Campaign `melee-semantic-20260908`.

Owned canonical and separate rendered coverage is lbcollision.c lines 1987-2666, all 680 lines. The four immutable page receipts in coverage.json carry source hashes and render metadata. All pages return ok with zero parse errors; the final page reaches line 2666. 16 targets and 53 empty parameter entities are accounted for. All 92 baseline facts have ID/version dispositions.

## Function Findings

- `HSD_JObjSetupMatrix`: Guards nullable joint setup with the combined non-user-defined and matrix-dirty predicate before delegating to HSD_JObjSetupMatrixSub. Canonical inline name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L256, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1385-L1443

- `lbColl_80008DA4`: Configures TEV, blending, depth and channel state from primary and ambient colors. Alpha below 255 enables blending and disables depth writes and channel lighting. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1987-L2039

- `lbColl_80008FC8`: Draws world-space endpoint geometry with two end display lists and an optional cylinder. Uses camera view and inverse-transpose normal matrices. Near-zero distance skips the cylinder. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2050-L2175

- `lbColl_800096B4`: Draws the same capsule with an extra caller matrix before camera view composition. Endpoints are local to that matrix and radius scales the geometry. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2177-L2304

- `lbColl_80009DD4`: Draws a quad using opposite XY corners, always v0.z; v1.z is unused. No culling; no gameplay mutation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2306-L2350, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L8705-L8777

- `lbColl_80009F54`: Draws enabled unsuppressed HitCapsule geometry with catch, inert or default palette. Pass 0 is opaque, pass 2 otherwise; x43_b1 bypasses owner scaling. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2352-L2388, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itdraw.c#L74-L127

- `lbColl_8000A044`: Draws the thrownHitbox supplied by fighter draw code, using fixed palette and the same HitCapsule state and scale guards. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2403-L2426, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L120-L227

- `lbColl_8000A10C`: Draws the It_Kind_Unk4 item collision record using x14/x8 endpoints and x0 multiplied by item scale. Caller validates special item flags. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2428-L2443, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itdraw.c#L74-L127

- `lbColl_8000A1A8`: Draws fighter x1614 record endpoints with x0 multiplied by scale_y. Exact gameplay category remains unresolved. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2445-L2460, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L120-L227

- `lbColl_8000A244`: Draws HurtCapsule using state palette; lazily refreshes endpoint cache, optionally replaces refreshed Z values and concatenates display/bone matrix. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2462-L2506, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2390-L2401, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2582-L2620, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itdraw.c#L74-L127

- `lbColl_8000A460`: Draws fighter x1670 joint marker as coincident capsule endpoints. Calls HSD_JObjSetupMatrix only on the selected alpha pass. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2508-L2527, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L120-L227

- `lbColl_8000A584`: Draws HurtCapsule with caller palette index except intangible state forces index 2. Cache refresh and optional display transform match ordinary hurt drawing. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2529-L2580, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2390-L2401, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2582-L2620, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itdraw.c#L74-L127

- `lbColl_8000A78C`: Draws shield_hit via shared cached-center sphere helper and shield palette; caller guard is x221B_b0. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2622-L2630, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2390-L2401, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2582-L2620, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L120-L227

- `lbColl_8000A95C`: Draws reflect_hit via shared cached-center sphere helper and reflector palette; caller guard is reflecting. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2632-L2640, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2390-L2401, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2582-L2620, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L120-L227

- `lbColl_8000AB2C`: Draws absorb_hit via shared cached-center sphere helper and absorber palette; caller guard is x2218_b6. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2642-L2650, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2390-L2401, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2582-L2620, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L120-L227

- `lbColl_8000ACFC`: Read-only pointer membership predicate over victims_1. Stops at first match, otherwise returns false. Null is not special-cased. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2652-L2665

## Helpers and Invariants

`isSmall` uses a strict open interval (-0.00001, 0.00001). `lbColl_DrawHitResult` inverse-transforms world endpoints before the matrix-aware renderer. `lbColl_DrawHit` creates coincident endpoints for HitResult, updates cached position only after the pass guard, and applies Z override only on refresh. None installs persistent callbacks. The renderer invokes GX and HSD routines, including indirect make_mtx through the foreign joint helper.

The near-zero capsule branch leaves the cylinder matrix uninitialized but later concatenates it before skipping cylinder submission. This is an existing source observation, not a matching or runtime failure claim. Radius zero and singular matrices are not guarded here.

## Dispositions and Limits

{'supersede': 16, 'retain': 72, 'unresolved': 4}. Proposed writes include supported inherited name evidence refresh and narrowed semantic corrections. No canonical source names change. No new type entities, links, merges, or follow-ups enter the proposal.

HSD_JObjSetupMatrix is defined in foreign baselib/jobj.h, not in the owned C file. The canonical wrapper and predicate prove the missing USER_DEF_MTX exclusion. Its existing linker deduplication explanation is narrowed because this review does not inspect compiler/linker output. Foreign rendered header has three parser errors and no substitutions; canonical guard evidence takes precedence.

The shield, reflector, absorber, thrown-hitbox and item aliases have pinned caller support. Exact original spelling remains inferred. Fighter_x1614 gameplay identity, Fighter_x1670 gameplay collision role, and shared HitResult/HurtCapsule/JObj layouts are family followups. Parameter entities have no existing facts; register slot spelling alone does not establish source argument mapping.

Remaining four unresolved facts concern CPU-only/exclusive rectangle caller claims, full victim-history game policy, and the broader throw-target-specific interpretation of x1064_thrownHitbox. Local drawing and membership behavior is established.

Validation passed in dry-run mode: 30 facts, zero rejected. Receipt directory: `games/melee/state/knowledge_v2/semantic-sweep-20260908/validation/d8db838dcbe570bdd2b9c4d4595fee1acc75930ac71a472e9fbbbc11890c0e3e/`. No shared KB changes were applied.
