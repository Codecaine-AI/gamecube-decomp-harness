# Naming Review

One correction is proposed: `hsd_803975D4` from `HSD_ParticleScreenRenewInput` to `HSD_DebugConsolePollInput`. The canonical comment identifies ParticleScreenState as a misnomer, and the function polls controller/reset state for the debug-console thread. All names remain hypotheses pending independent review.

| Canonical | Inherited | Proposed | Disposition |
|---|---|---|---|
| fn_80394DF4 | Exception_RemoveNode | Exception_RemoveNode | retain hypothesis |
| fn_80397374 | Exception_HandleSPRInput | Exception_HandleSPRInput | retain hypothesis |
| fn_80397814 | Exception_DebugThread | Exception_DebugThread | retain hypothesis |
| hsd_80394314 | HSD_DebugConsoleInitDisplay | HSD_DebugConsoleInitDisplay | retain hypothesis |
| hsd_80394434 | Exception_DrawText | Exception_DrawText | retain hypothesis |
| hsd_80394544 | HSD_ConsoleDrawRegion | HSD_ConsoleDrawRegion | retain hypothesis |
| hsd_80394950 | Exception_ReportFPUState | Exception_ReportFPUState | retain hypothesis |
| hsd_80394E8C | Exception_ActivateNode | Exception_ActivateNode | retain hypothesis |
| hsd_80394F48 | Exception_DrawMenu | Exception_DrawMenu | retain hypothesis |
| hsd_80395550 | DebugMenu_HandleListInput | DebugMenu_HandleListInput | retain hypothesis |
| hsd_80395644 | Exception_DrawPushStartPrompt | Exception_DrawPushStartPrompt | retain hypothesis |
| hsd_803956D8 | Exception_AutoPage | Exception_AutoPage | retain hypothesis |
| hsd_803957C0 | Exception_DrawReportCursor | Exception_DrawReportCursor | retain hypothesis |
| hsd_80395970 | Exception_ParseAddressAtCursor | Exception_ParseAddressAtCursor | retain hypothesis |
| hsd_80395A78 | Exception_HandleReportScreenInput | Exception_HandleReportScreenInput | retain hypothesis |
| hsd_80395D88 | Exception_HandleCommandMenu | Exception_HandleCommandMenu | retain hypothesis |
| hsd_80396130 | HSD_MemoryDumpInitAddress | HSD_MemoryDumpInitAddress | retain hypothesis |
| hsd_80396188 | HSD_MemoryDumpDraw | HSD_MemoryDumpDraw | retain hypothesis |
| hsd_803962A8 | HSD_MemoryDumpInputCallback | HSD_MemoryDumpInputCallback | retain hypothesis |
| hsd_803966A0 | MemoryDumpMenu_Select | MemoryDumpMenu_Select | retain hypothesis |
| hsd_80396884 | DrawMemoryAddressInput | DrawMemoryAddressInput | retain hypothesis |
| hsd_80396C78 | MemoryAddressMenu_Select | MemoryAddressMenu_Select | retain hypothesis |
| hsd_80396E40 | Exception_DrawBATPage | Exception_DrawBATPage | retain hypothesis |
| hsd_80397110 | Exception_DrawSPRPage | Exception_DrawSPRPage | retain hypothesis |
| hsd_80397520 | hsd_DebugConsoleDispatchNodeCallbacks | hsd_DebugConsoleDispatchNodeCallbacks | retain hypothesis |
| hsd_803975D4 | HSD_ParticleScreenRenewInput | HSD_DebugConsolePollInput | supersede hypothesis |
| hsd_80397DA4 | Exception_StartDebugThread | Exception_StartDebugThread | retain hypothesis |

Frozen baseline candidate lookups found no competing current canonical or inferred names. See naming-collisions.json. No source names changed.
