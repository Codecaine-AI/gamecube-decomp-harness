# Naming Decisions

| Subject | Canonical | Existing Hypothesis | Decision |
|---|---|---|---|
| Function | ftCo_800C703C | ftCo_ApplyItemJumpResponse | Retain as descriptive hypothesis supported by current caller and jumped_on callback. Original wording is not attested. |
| Section | .sdata2 | None | Keep section identity; no new semantic name. One float zero plus gap corroborated by existing objects and assembly. |
| Source | src/melee/ft/ftCo_800C703C.c | None | Keep identity and all three facts. |
| Parameter | ftCo_800C703C#r3 | None | Empty fact inventory reviewed; sole Fighter_GObj* input. |

All 13 existing facts have explicit ID/timestamp dispositions. Eleven remain unchanged. Two game-mapping facts are narrowed to the verified generic item jumped-on interaction, omitting unrevalidated shell examples. No new names or source renames are proposed.

Canonical naming evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C703C.c#L6-L13, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0819.c#L49-L92 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1439-L1451.

## Reviewed final render

Root promoted 2 reviewed facts. [Final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C703C/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C703C/staged-completion.json), and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/ad461ede9af7e0ea5ef3e3e4c21c017255d8790c85a2cdb1171419904efc7abf/2026-09-08T15-01-05.808Z-71ce551c-f561-47ae-90d9-6ba2845ad18d.receipt.json). Final-render SHA256: `79f267870e6c56bf263496033de2af83c62324c891f9282e5a6ddbd8deda37f8`. Canonical source unchanged.
