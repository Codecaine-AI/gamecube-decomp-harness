# Naming Review

Six inherited hypotheses retained pending independent review. No current candidate collision found in frozen baseline. No canonical names changed.

| Canonical | Hypothesis | Disposition |
|---|---|---|
| HSD_SisLib_803A7684 | HSD_SisLib_SaveTextState | retain hypothesis |
| HSD_SisLib_803A7F0C | HSD_SisLib_RestoreTextState | retain hypothesis |
| HSD_SisLib_803A8134 | HSD_SisLib_CalcTextSize | retain hypothesis |
| HSD_SisLib_803A84BC | HSD_SisLib_Draw | retain hypothesis |
| HSD_SisLib_803A945C | HSD_SisLib_LoadArchive | retain hypothesis |
| HSD_SisLib_803A947C | HSD_SisLib_FreeArchive | retain hypothesis |

RestoreTextState accurately avoids implying unconditional deletion: bit7 mismatch still restores. CalcTextSize is a line-fragment measurement with side effects. Canonical sisFitLineToBox and HSD_SisLib_GlyphWidth are inspected helpers, not new proposed identities.
