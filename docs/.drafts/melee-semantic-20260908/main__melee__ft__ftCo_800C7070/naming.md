# Naming Decisions

| Subject | Canonical Name | Existing Alias | Decision |
|---|---|---|---|
| Function | ftCo_800C7070 | None | Retain; demo Run behavior is verified, but no new name is promoted. |
| Data target | .sdata2 | None | Retain section identity; 0/1 animation literal pool describes behavior. |
| Source entity | src/melee/ft/ftCo_800C7070.c | None | Retain path identity. |
| Parameter #r3 | gobj | None | Retain declared parameter name and Fighter_GObj* type. |

Rendered views contain zero substitutions and no inherited inferred-name facts. No name is promoted, so no candidate namespace collision is introduced. x2219_b1 and x2219_b2 remain offset names pending the shared Fighter field review.

## Reviewed final render

Root promoted 7 reviewed fact operations. [Final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C7070/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C7070/staged-completion.json), and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/17fad127a15e9ed8506d28aa9cfe6ac5392237694f4814585ae17eb7eebe4725/2026-09-08T15-05-26.700Z-9de21f50-11e4-4925-8f06-dbe2d019758f.receipt.json). Final-render SHA256: `6ed37089cbf489e5a284e06ad36e36f2631bf610e67edad26a5af7d66a1052cc`. Canonical source unchanged.
