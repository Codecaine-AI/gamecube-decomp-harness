# Naming Table

| Canonical target | Existing inferred alias | Decision and independent support |
|---|---|---|
| .bss | none | Retain canonical; Persistent 0x48-byte singleton holds colors, floating steps, wipe frontier, suppression/mode and two object handles. |
| .data | none | Retain canonical; Two world-object descriptors and perspective camera; existing object .data is96 bytes. |
| .sdata | none | Retain canonical; Four GXColor presets occupy16 bytes in existing objects. |
| .sdata2 | none | Retain canonical; Existing object scalar pool contains zero, one,640,-480 and conversion doubles; camera descriptor parameters belong to .data. |
| fn_8001FC08 | lbBgFlash_UpdateColor | Retain hypothesis; Per-channel signed step and directional target clamp; no publication to byte colors. |
| fn_8001FEC4 | lbBgFlash_Draw | Retain hypothesis; Draws current color or complementary black wipe masks; active1 suppresses only drawing. |
| fn_800204C8 | lbBgFlash_Proc | Retain hypothesis; Updates color or wipe frontier without consulting active; publishes bytes or completion. |
| fn_800208B0 | lbBgFlash_InitBlack | Retain hypothesis; Publish black with caller alpha in mode5, active0. |
| lbBgFlash_800205F0 | lbBgFlash_FadeWhiteToBlack | Retain hypothesis; Configure opaque white to opaque black; duration min1; mode0. |
| lbBgFlash_8002063C | lbBgFlash_FadeInBlack | Retain hypothesis; Configure transparent black to opaque black; duration min1; mode0. |
| lbBgFlash_80020688 | lbBgFlash_FadeInWhite | Retain hypothesis; Configure transparent black to opaque white; RGBA all rise; mode0. |
| lbBgFlash_800206D4 | lbBgFlash_SetColorTransition | Retain hypothesis; Install colors and duration-normalized floating steps; enable drawing and mode2, no countdown. |
| lbBgFlash_800208EC | lbBgFlash_InitWithPriority | Retain hypothesis; Allocate camera and effect objects and register draw/proc at low-byte argument priority. |
| lbBgFlash_800209F4 | lbBgFlash_Init | Unresolved cross-TU alias collision; Allocate camera and effect objects at render priority10; suppress drawing, mode0. |
| lbBgFlash_InitState | none | Retain canonical; Publish caller color in mode5, active0; interpolation and object fields unchanged. |

Unresolved inherited alias collision: lbBgFlash_Init is also assigned to main/melee/lb/lb_0219:lbBgFlash_80021A18 in the frozen baseline. No unique alias is promoted here; defer to cross-TU naming reconciliation.
