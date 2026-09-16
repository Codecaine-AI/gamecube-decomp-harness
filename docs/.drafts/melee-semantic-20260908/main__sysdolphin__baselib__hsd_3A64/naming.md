# Naming review

No new aliases proposed. Retain eleven descriptive hypotheses without historical spelling claims. Clear the table-wrapper CopyString and mutable-wrapper CreateText aliases to resolve duplicate raw-copier and foreign-constructor names. Canonical source identifiers remain authoritative. Pinned source grep found no canonical occurrence of the candidate names.

| Canonical | Alias | Decision |
|---|---|---|
| .data | - | retain canonical |
| .sdata2 | - | retain canonical |
| HSD_SisLib_803A6478 | HSD_SisLib_CopyString | retain hypothesis |
| HSD_SisLib_803A6530 | HSD_SisLib_CopyString | Same HSD_SisLib_CopyString alias is already assigned to the raw-pointer copier. Keep canonical wrapper identity until an independently reviewed distinct name is chosen. |
| HSD_SisLib_803A660C | HSD_SisLib_AppendString | retain hypothesis |
| HSD_SisLib_803A6754 | HSD_SisLib_CreateText | HSD_SisLib_CreateText collides with the lower-level foreign constructor. Keep canonical identity for the mutable-buffer wrapper; family naming requires separate review. |
| HSD_SisLib_803A67EC | HSD_SisLib_EncodeString | retain hypothesis |
| HSD_SisLib_803A6B98 | HSD_SisLib_AddText | retain hypothesis |
| HSD_SisLib_803A70A0 | HSD_SisLib_SetEntryText | retain hypothesis |
| HSD_SisLib_803A746C | HSD_SisLib_SetEntryPosition | retain hypothesis |
| HSD_SisLib_803A74F0 | HSD_SisLib_SetTextEntryRGB | retain hypothesis |
| HSD_SisLib_803A7548 | HSD_SisLib_SetTextScale | retain hypothesis |
| HSD_SisLib_803A75E0 | HSD_SisLib_ClearText | retain hypothesis |
| HSD_SisLib_803A7664 | HSD_SisLib_ClearTextBuffer | retain hypothesis |
| fn_803A6FEC | HSD_SisLib_FindEntry | retain hypothesis |
