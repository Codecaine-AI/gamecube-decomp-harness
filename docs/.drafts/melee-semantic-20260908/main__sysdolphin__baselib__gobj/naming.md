# Naming Decisions

| Canonical | Existing Alias | Proposed Alias | Decision |
|---|---|---|---|
| .bss | none | none | retain canonical |
| .data | none | none | retain canonical |
| .sbss | none | none | retain canonical |
| HSD_GObj_80390C5C | none | none | retain canonical |
| HSD_GObj_80390C84 | HSD_GObjResumeProcs | HSD_GObjClearProcFlag1 | supersede |
| HSD_GObj_80390CAC | HSD_GObj_ResumeProcs | HSD_GObjClearProcFlag2 | supersede |
| HSD_GObj_80390CD4 | none | none | retain canonical |
| HSD_GObj_80390CFC | GObj_RunProcs | none | retain |
| HSD_GObj_80390EB8 | HSD_GObjGetTrspMask | none | retain |
| HSD_GObj_80390ED0 | HSD_GObj_SetTextureCamera | HSD_GObjDispatchRenderPasses | supersede |
| HSD_GObj_80390FC0 | GObj_RunGXLinkMaxCallbacks | none | retain |
| HSD_GObj_803910D8 | HSD_GObj_CObjCallback | none | retain |
| HSD_GObj_80391120 | HSD_ObjUnref | none | retain |
| HSD_GObj_803911C0 | none | none | retain canonical |
| HSD_GObj_80391260 | none | none | retain canonical |
| HSD_GObj_803912A8 | HSD_GObjRegisterFuncs | none | retain |
| HSD_GObj_FogCallback | none | none | retain canonical |
| HSD_GObj_JObjCallback | none | none | retain canonical |
| HSD_GObj_LObjCallback | none | none | retain canonical |

The two GObj_Run* comment-derived aliases remain supported hypotheses. The renderer reports collisions against source comment words. New names distinguish flags_1/flags_2 and name render dispatch directly. Canonical source remains unchanged.
