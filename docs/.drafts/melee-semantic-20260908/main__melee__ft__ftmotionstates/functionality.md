## Shared fighter motion descriptors

`ftmotionstates.c` is a data-only source unit defining `ftData_MotionStateList[ftCo_MS_Count]`, with common motion indices 0–340, followed in source by `ftData_803C52A0[14]`. Records bind animation identity, motion flags and packed move metadata to animation, input, physics, collision and camera callbacks.

Fighter initialization installs the common table with boundary `0x155` (341). Generic state entry selects the common descriptor below that boundary and the fighter-kind descriptor otherwise, consumes its metadata, conditionally configures animation/script resources, and replaces all five standard callbacks. The descriptor arrays are shared data; the installed callbacks belong to each fighter's active state. NULL slots omit the corresponding table-provided callback, not all generic engine processing. Animation setup additionally depends on transition flags, animation identity and optional resources from another fighter.

The common table spans death/respawn, locomotion, attacks, item use, defense, damage, grabs and captures, ledge actions, transformations and boss/hazard interactions. Related states often share callbacks without sharing animation identity or flags. Important exceptions include camera-only CaptureNeck/Foot and CaptureMewtwo entries, Anim-only ReboundStop, missing IASA/physics callbacks during mushroom transformations, and specialized death, up-throw, ledge and Warp Star cameras. Cliff jumps use the ordinary camera callback rather than the cliff camera. Literal flag expressions are preserved without inferring behavior from their names alone.

The auxiliary table has 14 records. Only indices 0, 2 and 5 have non-NULL animation callbacks (`ftCo_800BED84`, `ftCo_800BEF00`, `ftCo_800BEFD0`); all other callback slots are NULL. These three functions have empty canonical bodies. Auxiliary animation constants and numeric indices do not establish ordinary common-state meanings or its runtime installation path.

## Semantic review

Eight baseline facts and all four links remain supported. The compiled-layout assertion is replaced with a source-level type description: source ordering does not prove section contiguity, byte extent or ABI record size. The rendered view parses successfully and has one substitution: `ftCo_800BEFD0` becomes `ftCo_DeadUpStarIce_Cam`. That hypothesis is not supported by its animation-slot placement and empty body; owner review is recorded separately.

Status: researched; no-change lead bypass; independent review and live promotion pending.
