# Camera Mode Naming

Canonical symbols stay unchanged. Aliases remain descriptive hypotheses.

| Canonical Target | Existing Alias | Proposed Alias | Disposition |
|---|---|---|---|
| .data |  |  | canonical retained |
| .sbss |  |  | canonical retained |
| gm_801B23F0 | gm_PreloadCameraModeResources | gm_PreloadCameraModeResources | retain |
| gm_801B24B4 |  |  | canonical retained |
| gm_801B2510 |  |  | canonical retained |
| gm_801B254C | gm_PrepCameraModeCSSScene | gm_PrepCameraModeCSSScene | retain |
| gm_801B25D4 |  | gm_ExitCameraModeCSSScene | new inferred alias |
| gm_801B26AC | gm_CameraMode_EnterSss | gm_CameraMode_EnterSss | retain |
| gm_801B2704 | gm_ExitCameraModeSSSScene | gm_ExitCameraModeSSSScene | retain |
| gm_801B2AF8 | gm_ExitCameraModeVSScene |  | retain |
| gm_Mode_Camera_OnInit |  |  | canonical retained |
| gm_PrepCameraModeVSScene |  |  | canonical retained |

## Reviewed final render

Root promoted 58 reviewed facts to the live KB. [Final-render receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcameramode/final-render.json) records the exact reviewed rendered pages; [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcameramode/staged-completion.json) and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/6af2df456979626559b3a01adb7f51185a0e20f369b20ca20f92389caaeb0ec5/2026-09-08T14-38-03.736Z-62a0b319-19bf-42f5-9a97-421d33238380.receipt.json) establish application. Final-render SHA256: `196b1712029fccb12620580b35dab43030c99a020bea65d94c4c009c40db45a4`. Canonical source remains unchanged.
