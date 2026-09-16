# Guard Names

Five proposed names distinguish held input and entry paths. Every name is an inference; canonical source names remain unchanged. No proposed spelling appears in pinned source or immutable baseline inferred names.

| Canonical | Existing hypothesis | Reviewed hypothesis | Decision |
|---|---|---|---|
| ftCo_80091A2C | ftCo_Guard_CheckInput | ftCo_Guard_IsHeld | supersede |
| ftCo_80091A4C | ftCo_Guard_CheckInput | ftCo_Guard_CheckInput | retain |
| ftCo_80091AD8 | ftCo_Guard_CheckInput_Dash | ftCo_Guard_CheckInput_Dash | retain |
| ftCo_80091B90 | ftCo_Guard_SetMv20 | ftCo_Guard_SetMv20 | retain |
| ftCo_80091B9C | ftCo_Guard_SetMv24 | ftCo_Guard_SetMv24 | retain |
| ftCo_80091BC4 | ftCo_Guard_UpdateStick | ftCo_Guard_UpdateStick | retain |
| ftCo_80091D58 | ftCo_Guard_SetShieldScale | ftCo_Guard_SetShieldScale | retain |
| ftCo_80091E78 | ftCo_Guard_UpdateShield | ftCo_Guard_UpdateShield | retain |
| ftCo_80092158 | ftCo_SpawnGuardEffect | ftCo_SpawnGuardEffect | retain |
| ftCo_800921DC | ftCo_Guard_Init | ftCo_Guard_Init | retain |
| ftCo_800923B4 | ftCo_GuardOn_Enter | ftCo_GuardOn_Enter | retain |
| ftCo_80092450 | ftCo_Guard_ActivateShield | ftCo_Guard_ActivateShield | retain |
| ftCo_800924C0 | ftCo_GuardOn_Enter | ftCo_GuardOn_EnterCommon | supersede |
| ftCo_800925A4 | ftCo_Guard_UpdateShieldHealth | ftCo_Guard_UpdateShieldHealth | retain |
| ftCo_800928CC | ftCo_GuardOn_EnterGuard | ftCo_GuardOn_EnterGuard | retain |
| ftCo_80092908 | ftCo_Guard_Enter | ftCo_Guard_Enter | retain |
| ftCo_80092BCC | ftCo_Guard_CheckReleaseInput | ftCo_Guard_CheckReleaseInput | retain |
| ftCo_80092C54 | ftCo_GuardOff_Enter | ftCo_GuardOff_Enter | retain |
| ftCo_80092E50 | ftCo_Guard_OnShieldHit | ftCo_Guard_OnShieldHit | retain |
| ftCo_80092ED8 | ftCo_CalcShieldHitResponse | ftCo_CalcShieldHitResponse | retain |
| ftCo_80093240 | ftCo_GuardSetOff_OnEveryHitlag | ftCo_GuardSetOff_OnEveryHitlag | retain |
| ftCo_800932DC | ftCo_GuardSetOff_PostHitlag | ftCo_GuardSetOff_PostHitlag | retain |
| ftCo_80093694 | ftCo_GuardReflect_CheckInput | ftCo_GuardReflect_CheckInput | retain |
| ftCo_8009370C | ftCo_GuardReflect_CreateReflectHit | ftCo_GuardReflect_CreateReflectHit | retain |
| ftCo_80093790 | ftCo_GuardReflect_OnReflect | ftCo_GuardReflect_OnReflect | retain |
| ftCo_80093850 | decideFighter | ftCo_GuardReflect_EnterFromGuardOn | supersede |
| ftCo_8009388C | ftCo_GuardReflect_Enter | ftCo_GuardReflect_EnterFromGuardOnCommon | supersede |
| ftCo_800939B4 | ftCo_GuardReflect_Enter | ftCo_GuardReflect_Enter | retain |
| ftCo_80093A50 | ftCo_GuardReflect_Enter | ftCo_GuardReflect_EnterCommon | supersede |
| ftCo_80093BC0 | ftCo_Guard_UpdatePowershieldTimers | ftCo_Guard_UpdatePowershieldTimers | retain |
| ftCo_80094098 | ftCo_GetShieldPositionAndSize | ftCo_GetShieldPositionAndSize | retain |
| ftCo_80094138 | ftCo_GuardReflect_OnShieldHitInit | ftCo_GuardReflect_OnShieldHitInit | retain |

Named callbacks retain canonical names. .sdata and .sdata2 remain section targets without invented object names. All empty parameter inventories are listed in coverage.json. Foreign aliases and types remain outside ownership.
