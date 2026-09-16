# `lbcollision` Functionality

Draft semantic review for `main/melee/lb/lbcollision` at `c302741689bd67c361cd7faadb221df3193992c3`. Root independently reviewed and promoted 115 facts to the live KB. Canonical source names and source code remain unchanged.

## Responsibilities

This unit supplies shared combat-collision calculations and GX collision visualization. It accepts segment endpoints, radii, bone matrices, and hit/hurt/result records. It calculates overlap and contact positions, caches bone-relative world positions, maintains hit-capsule activation and victim histories, and selects impact sounds. The header exports collision, maintenance and drawing functions plus finite-bound and epsilon helpers.

The main collision path goes from typed wrappers to numeric geometry. `lbColl_80007AFC` compares two hit capsules with per-capsule scaling rules. `lbColl_80007BCC` adapts a `HitResult` sphere. `lbColl_80007ECC`, `lbColl_8000805C`, and `lbColl_80008248` adapt hurt capsules with different state gates. These wrappers update cached world endpoints, optionally override Z and compose matrices, select the hit radius, and call the shared capsule solver. The solver writes contact position and overlap into the hit record. See [wrapper evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1550-L1773).

`lbColl_80006E58` first rejects separated endpoint bounds. It selects candidate points on finite axes, uses the inverse hurt matrix to measure directional hurt-radius scale, and writes overlap and a contact point. The zero-separation branch returns true directly. Later separation failure can still leave output points and negative overlap written. Callers must honor the Boolean return instead of assuming unchanged outputs on every false result. See [contact calculation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1397-L1443).

The near-parallel branches choose a first-axis endpoint near the second-axis midpoint and project that endpoint. This is an endpoint heuristic, not a universal minimum-distance guarantee. `lbColl_800067F8` also uses Z in its parallel projection although its broadphase and final distance are planar. See [parallel endpoint selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1285-L1350).

## State and Side Effects

`skip_update_pos` suppresses repeated bone-to-world transforms. `lbColl_800083C4` only refreshes positions when that flag is clear and sets it afterward. This file does not establish the caller protocol for clearing the cache between updates. `lbColl_80008428` and `lbColl_80008434` write disabled/enabled state directly.

The two victim tables support duplicate detection, refreshable counters, insertion into an empty slot, and bounded cursor replacement when full. Their accepted type sets differ: type 4 refreshes table 1, but not table 2. Registration returns false for an existing pointer and true for a new insertion. Timer maintenance runs only while the capsule is not disabled. It decrements nonzero counters and clears the victim pointer when the counter reaches zero. A stored zero counter does not expire through this path. See [victim maintenance](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1824-L1969).

The canonical name `lbColl_CopyHitCapsule` remains unchanged. Its body copies only both victim tables and their replacement cursors. It does not copy the full collision record. `lbColl_80008D30` separately copies selected hit parameters, including state, damage, knockback-related values, element and sound fields. See [copy behavior](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1809-L1822).

## Rendering and Sound

The sound entry point indexes an integer table by `sfx_kind * 3 + sfx_severity`. It supplies fixed volume/pan values and forwards its second argument only for kind 13 with severity 2. Other cases pass -1. See [sound dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L232-L248).

Drawing routines select colors and an alpha-derived render pass, prepare transforms, then submit packed sphere and cylinder resources to GX. The capsule renderer orients and scales two ends and draws a cylinder only for a non-small segment length. It invalidates HSD render state before and after drawing. HitResult wrappers share the same drawing helper and use separate palette pairs. Canonical fighter callers identify the shield, reflector and absorber records passed to those wrappers. See [GX capsule construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L2050-L2174) and [category callers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L144-L160).

## Dependencies and Limits

Bone transforms come from the lb joint helpers and HSD JObj matrix access; matrix/vector arithmetic comes from Dolphin and HSD helpers. GX/HSD graphics state and current-camera view matrices drive rendering. Audio dispatch comes from `lbAudioAx_80024184`. Fighter/item structures and baselib inline definitions are foreign dependencies. Their shared layouts and global identities require separate ownership review.

The header declares `lbColl_JObjSetupMatrix` at the address represented in the manifest by `HSD_JObjSetupMatrix`. There is no standalone body in the owned C file. This identity mismatch must remain explicit; it does not justify a source rename or entity merge. Parameter entities whose `#rN` labels exceed or ambiguously map source parameters remain untyped until ABI metadata is available.

Independent review leaves the broader gameplay interpretation of `x1064_thrownHitbox` unresolved. Its draw caller establishes which record is visualized, not a throw-target-specific hitbox-effect policy. The existing `lbColl_DrawThrownHitbox` hypothesis names the drawn record.

Staged application artifacts: [final-render.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbcollision/final-render.json>) and [staged-completion.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbcollision/staged-completion.json>).

Live promotion receipt: [receipt.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/c6de81a80f0698c45f48b23824f2b784100386008b5c05b5584a97df864ae125/2026-09-08T14-38-02.603Z-6dbb1535-76e6-4536-befe-177d27454f1a.receipt.json>).
