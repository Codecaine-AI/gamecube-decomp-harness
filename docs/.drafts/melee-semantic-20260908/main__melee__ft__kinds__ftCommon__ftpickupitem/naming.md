# Naming decisions

| Canonical function | Existing hypothesis | Disposition |
|---|---|---|
| fttpickupitem_80094150 | fttpickupitem_IsItemInRange | Retain; strict eligible overlap predicate. |
| fttpickupitem_800942A0 | fttpickupitem_FindItemInRange | Retain; closest eligible item query. |
| fttpickupitem_8009447C | ftGetImmItem | Retain; diagnostic text supports the label, but canonical numeric name remains authoritative. |
| fttpickupitem_80094694 | fttpickupitem_InitMotion | Retain; motion setup and animation advance. |
| fttpickupitem_80094818 | fttpickupitem_OnItemPickup | Retain; notification and bookkeeping. |
| fttpickupitem_80094DF8 | fttpickupitem_Take_Dmg_Cb | Retain; installed ordinary pickup damage callback. |

All other eight canonical function names and both data identities remain unchanged. No names are promoted or cleared. The frozen registry has only one current inferred-name row with value ftGetImmItem; owned rendering nevertheless reports name_collision, so no uniqueness claim is made from rendered substitutions. Header numeric address comments differ from current target addresses; this review does not rewrite them.

All 22 parameter entities are described individually in coverage.json. They represent Fighter_GObj inputs, candidate/acquired Item_GObj inputs, a weight mask, a motion ID and Boolean loop/notification context. All have empty baseline facts. Source-only fttpickupitem_800942A0_inline returns the pickup-attribute address and has no writable KB identity.
