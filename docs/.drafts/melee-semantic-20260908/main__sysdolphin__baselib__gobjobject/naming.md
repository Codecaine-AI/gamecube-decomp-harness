# Naming Decisions

Resolve the inherited duplicate GObj_RemoveObject hypothesis by separating detach from callback cleanup. Canonical source names stay unchanged.

| Canonical | Existing Hypothesis | Proposed Hypothesis | Decision |
|---|---|---|---|
| `HSD_GObjObject_80390A3C` | None | `GObj_FindByClassifier` | new hypothesis |
| `HSD_GObjObject_80390A70` | `GObj_InitKindObj` | `GObj_InitKindObj` | retain |
| `HSD_GObjObject_80390ADC` | `GObj_RemoveObject` | `GObj_DetachObject` | supersede collision |
| `HSD_GObjObject_80390B0C` | `GObj_RemoveObject` | `GObj_RemoveObject` | retain |

Detach returns the old payload without invoking the table; cleanup dispatches before clearing fields. Keeping the existing cleanup alias avoids another unnecessary rename while removing the collision. The lookup alias describes the first-match classifier query; its list bucket remains an explicit parameter. No proposed spelling was found as a canonical source/include symbol. Frozen KB collisions and exact evidence are documented in the review artifacts. Independent review is required before application.
