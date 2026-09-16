# Camera Naming Review

Canonical symbols stay authoritative. Retained aliases remain hypotheses. Rejected or deferred aliases are preserved below for review. IDs, versions and evidence are in `fact-dispositions.json`.

| Canonical Symbol | Inherited Alias | Disposition | Proposed Reading |
|---|---|---|---|
| Camera_Init | Camera_Init | reject | canonical name; clear alias |
| Camera_80028F5C | Camera_InitSubject | retain | Camera_InitSubject |
| Camera_80029020 | Camera_AllocSubject | retain | Camera_AllocSubject |
| Camera_80029044 | Camera_AllocSubjectWithState | retain | Camera_AllocSubjectWithState |
| Camera_800290D4 | Camera_FreeSubject | retain | Camera_FreeSubject |
| Camera_80029124 | Camera_GetBoundsFlags | retain | Camera_GetBoundsFlags |
| Camera_8002928C | Camera_CheckSubjectEligibility | retain | Camera_CheckSubjectEligibility |
| Camera_800293E0 | Camera_ApproachSubjectBounds | retain | Camera_ApproachSubjectBounds |
| Camera_8002958C | Camera_CalcSubjectBounds | retain | Camera_CalcSubjectBounds |
| Camera_80029AAC | Camera_ApproachTargetInterest | retain | Camera_ApproachTargetInterest |
| Camera_80029BC4 | Camera_CalcBoundsDepth | retain | Camera_CalcBoundsDepth |
| Camera_80029C88 | Camera_SmoothPositionTowardTarget | retain | Camera_SmoothPositionTowardTarget |
| Camera_80029CF8 | Camera_CalcTransformFromBounds | retain | Camera_CalcTransformFromBounds |
| Camera_ApplyQuake | Camera_ApplyQuakeTranslation | reject | canonical name; clear alias |
| Camera_SetQuakeOffset | Camera_SetQuakeOffset | reject | canonical name; clear alias |
| Camera_UpdateQuakes | Camera_UpdateTransientEffects | reject | canonical name; clear alias |
| Camera_8002A4AC | Camera_UpdateCObj | retain | Camera_UpdateCObj |
| Camera_8002A768 | Camera_KeepTargetViewWithinStageBounds | retain | Camera_KeepTargetViewWithinStageBounds |
| Camera_8002AF68 | Camera_ApplyTransformToCObj | retain | Camera_ApplyTransformToCObj |
| Camera_8002B0E0 | Camera_Update1PZoom | unresolved | Camera_Update1PZoom |
| Camera_8002B1F8 | Camera_Apply1PZoom | unresolved | Camera_Apply1PZoom |
| Camera_8002B3D4 | Camera_UpdateGameplay | retain | Camera_UpdateGameplay |
| Camera_8002B694 | Camera_GetInputs | retain | Camera_GetInputs |
| Camera_8002BA00 | Camera_StepSubjectSlot | retain | Camera_StepSubjectSlot |
| Camera_8002BAA8 | Camera_PauseZoom | retain | Camera_PauseZoom |
| Camera_8002BC78 | Camera_ClampPauseRotationBasis | retain | Camera_ClampPauseRotationBasis |
| Camera_8002BD88 | Camera_PauseRotate | retain | Camera_PauseRotate |
| Camera_8002C010 | Camera_PanPauseCamera | retain | Camera_PanPauseCamera |
| Camera_8002C1A8 | Camera_FreeControl | unresolved | Camera_FreeControl |
| Camera_8002C5B4 | Camera_ClampPauseCamera | retain | Camera_ClampPauseCamera |
| Camera_8002C908 | Camera_FreeThink | unresolved | Camera_FreeThink |
| Camera_8002CB0C | Camera_UpdatePauseCameraInput | retain | Camera_UpdatePauseCameraInput |
| Camera_8002CDDC | Camera_UpdatePause | retain | Camera_UpdatePause |
| Camera_8002D318 | Camera_UpdateTrainingMenu | retain | Camera_UpdateTrainingMenu |
| Camera_8002D85C | Camera_UpdateClear | retain | Camera_UpdateClear |
| Camera_8002DDC4 | Camera_UpdateFixed | retain | Camera_UpdateFixed |
| Camera_8002DFE4 | Camera_InterpolateInterest | retain | Camera_InterpolateInterest |
| Camera_8002E158 | Camera_InterpolateScalar | retain | Camera_InterpolateScalar |
| Camera_8002E234 | Camera_UpdatePositionTransition | retain | Camera_UpdatePositionTransition |
| Camera_8002E490 | Camera_UpdateBossIntroTransition | retain | Camera_UpdateBossIntroTransition |
| Camera_8002E6FC | Camera_SetBossIntroInterestPlayer | retain | Camera_SetBossIntroInterestPlayer |
| Camera_8002E818 | Camera_SetTargetInterest | retain | Camera_SetTargetInterest |
| Camera_8002E948 | Camera_SetTargetInterestCallback | retain | Camera_SetTargetInterestCallback |
| Camera_8002EA64 | Camera_SetTargetPosition | retain | Camera_SetTargetPosition |
| Camera_8002EB5C | Camera_SetBossIntroPositionElevation | retain | Camera_SetBossIntroPositionElevation |
| Camera_8002EC7C | Camera_SetTargetPositionYaw | retain | Camera_SetTargetPositionYaw |
| Camera_8002ED9C | Camera_SetBossIntroDistance | retain | Camera_SetBossIntroDistance |
| Camera_8002EEC8 | Camera_SetBossIntroFov | retain | Camera_SetBossIntroFov |
| Camera_8002EF14 | Camera_ApplyBossIntroTargets | retain | Camera_ApplyBossIntroTargets |
| Camera_8002F0E4 | Camera_StartTimedTransition | retain | Camera_StartTimedTransition |
| Camera_8002F260 | Camera_IsTransitionComplete | retain | Camera_IsTransitionComplete |
| Camera_8002F274 | Camera_SetTargetPositionToCurrent | retain | Camera_SetTargetPositionToCurrent |
| Camera_8002F3AC | Camera_SnapToTarget | retain | Camera_SnapToTarget |
| Camera_8002F760 | Camera_SetUpPauseCameraWithMinZoom | retain | Camera_SetUpPauseCameraWithMinZoom |
| Camera_8002F784 | Camera_SetModeToTrainingMenu | retain | Camera_SetModeToTrainingMenu |
| Camera_8002F7AC | Camera_SetModeToClear | retain | Camera_SetModeToClear |
| Camera_8002F9E4 | Camera_SetUpFreeCamera | retain | Camera_SetUpFreeCamera |
| Camera_8002FC7C | Camera_SetUpCameraMode | unresolved | Camera_SetUpCameraMode |
| Camera_8002FE38 | Camera_SetModeToBossIntro | retain | Camera_SetModeToBossIntro |
| Camera_8002FEEC | Camera_SetModeToDebugFollow | retain | Camera_SetModeToDebugFollow |
| Camera_8003006C | Camera_SetModeToDebugFree | retain | Camera_SetModeToDebugFree |
| Camera_800300F0 | Camera_RestoreMode | retain | Camera_RestoreMode |
| Camera_8003010C | Camera_IsFreeMode | retain | Camera_IsFreeMode |
| Camera_80030130 | Camera_IsBossIntro | retain | Camera_IsBossIntro |
| Camera_80030154 | Camera_IsDebugFollow | retain | Camera_IsDebugFollow |
| Camera_80030178 | Camera_IsDebugFree | retain | Camera_IsDebugFree |
| Camera_8003019C | Camera_GetDebugFollowTargetPosition | retain | Camera_GetDebugFollowTargetPosition |
| Camera_80030730 | Camera_SetVerticalTilt | supersede | Camera_SetDefaultFov |
| Camera_800307D0 | Camera_GetGroundViewBounds | retain | Camera_GetGroundViewBounds |
| Camera_80030A50 | Camera_GetGObj | retain | Camera_GetGObj |
| Camera_80030A78 | Camera_IsCollisionDebugEnabled | retain | Camera_IsCollisionDebugEnabled |
| Camera_80030A8C | Camera_SetZonesVisible | retain | Camera_SetZonesVisible |
| Camera_80030AC4 | Camera_IsStageVisible | retain | Camera_IsStageVisible |
| Camera_80030AE0 | Camera_SetPlayerZPositionCheck | retain | Camera_SetPlayerZPositionCheck |
| Camera_80030B0C | Camera_SetShadowRenderOverride | unresolved | Camera_SetShadowRenderOverride |
| Camera_80030B24 | Camera_GetShadowRenderOverride | unresolved | Camera_GetShadowRenderOverride |
| Camera_80030B38 | Camera_SetStageTerrainVisible | unresolved | Camera_SetStageTerrainVisible |
| Camera_80030B50 | Camera_IsStageTerrainVisible | unresolved | Camera_IsStageTerrainVisible |
| Camera_80030B64 | Camera_SetPlatformLedgeDebugDraw | unresolved | Camera_SetPlatformLedgeDebugDraw |
| Camera_80030B7C | Camera_IsDebugPlatformViewEnabled | unresolved | Camera_IsDebugPlatformViewEnabled |
| Camera_80030B90 | Camera_SetDrawSpecialPoints | retain | Camera_SetDrawSpecialPoints |
| Camera_80030BA8 | Camera_GetSpecialPointsVisible | retain | Camera_GetSpecialPointsVisible |
| Camera_80030BBC | Camera_IsPointOnScreen | retain | Camera_IsPointOnScreen |
| Camera_80030CD8 | Camera_IsSubjectCenterOnScreen | retain | Camera_IsSubjectCenterOnScreen |
| Camera_80030CFC | Camera_IsSubjectOnScreen | reject | canonical name; clear alias |
| Camera_80030DE4 | Camera_SetTranslation | retain | Camera_SetTranslation |
| Camera_80030DF8 | Camera_ResetTranslation | retain | Camera_ResetTranslation |
| Camera_80030E10 | Camera_GetAverageBoundsWidth | retain | Camera_GetAverageBoundsWidth |
| Camera_80031060 | Camera_GetRenderMode | retain | Camera_GetRenderMode |
| Camera_80031074 | Camera_SetRenderMode | retain | Camera_SetRenderMode |
| Camera_8003108C | Camera_GetStageRenderGroup | retain | Camera_GetStageRenderGroup |
| Camera_800310A0 | Camera_SetStageRenderGroup | retain | Camera_SetStageRenderGroup |
| Camera_800310B8 | Camera_GetCObj | supersede | Camera_RefreshSecondaryCObj |
| Camera_800310E8 | Camera_ResetRenderFlags | retain | Camera_ResetRenderFlags |
| Camera_80031144 | Camera_GetZoomScale | retain | Camera_GetZoomScale |
| Camera_80031154 | Camera_IsPositionInBounds | retain | Camera_IsPositionInBounds |
| Camera_8003118C | Camera_IsPositionInBoundsWithMargin | retain | Camera_IsPositionInBoundsWithMargin |
| Camera_800311CC | Camera_SetFar | retain | Camera_SetFar |
| Camera_800311DC | Camera_SetNearZ | retain | Camera_SetNearZ |
| Camera_80031328 | Camera_RenderGXLinksPass2 | retain | Camera_RenderGXLinksPass2 |
| Camera_Create | Camera_CreateGObj | reject | canonical name; clear alias |
| Camera_GetBackgroundColor | Camera_GetBackgroundColor | reject | canonical name; clear alias |
| Camera_RequestQuake | Camera_StartQuake | reject | canonical name; clear alias |
| Camera_StopQuake | Camera_StopQuake | reject | canonical name; clear alias |
| fn_8002F360 | Camera_UpdateMode | retain | Camera_UpdateMode |
| fn_8002F908 | Camera_CalcScaledStageBounds | reject | canonical name; clear alias |
| fn_8002FBA0 | Camera_CalcScaledStageBounds | reject | canonical name; clear alias |
| fn_800301D0 | Camera_RenderCallback | retain | Camera_RenderCallback |
