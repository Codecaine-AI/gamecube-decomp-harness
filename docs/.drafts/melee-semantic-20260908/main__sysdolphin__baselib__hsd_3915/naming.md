# Naming Review

Canonical names remain authoritative. No new names. Six inherited hypotheses retained pending lead review.

| Canonical | Hypothesis | Disposition |
|---|---|---|
| hsd_80391A04 | SetupDraw | retain hypothesis |
| hsd_80391AC8 | DrawString | retain hypothesis |
| hsd_80391E18 | DrawGradientLine | retain hypothesis |
| hsd_80391F28 | DrawTickedLine | retain hypothesis |
| hsd_803921B8 | DrawGlyph | retain hypothesis |
| hsd_803922FC | DrawGlyphInterlaced | retain hypothesis |

DrawGradientLine emits constant-color bands, not interpolated endpoint colors. Stale parameter locators for fn_80392480, fn_80392A08 and hsd_80392528 remain unresolved identity followups; their actual bodies are in other TUs.
