# Fighter Collision Naming

Canonical symbols stay unchanged. Aliases remain descriptive hypotheses.

| Canonical Target | Existing Alias | Proposed Alias | Disposition |
|---|---|---|---|
| .bss |  |  | canonical retained |
| .data |  |  | canonical retained |
| .sbss |  |  | canonical retained |
| .sdata |  |  | canonical retained |
| .sdata2 |  |  | canonical retained |
| ftColl_800763C0 | ftColl_UpdateComboCount |  | retain |
| ftColl_80076444 | ftColl_UpdateComboCountFromFighter |  | retain |
| ftColl_8007646C | ftColl_UpdateItemComboCount |  | retain |
| ftColl_800764DC | ftColl_ComboCountUpdate |  | retain |
| ftColl_80076528 | ftColl_UpdateComboPushback |  | retain |
| ftColl_800765AC | ftColl_ClearComboVictim |  | retain |
| ftColl_800765E0 | ftColl_ResetHitLogs |  | retain |
| ftColl_800765F0 | ftColl_ApplyDamageModifiers |  | retain |
| ftColl_80076640 | ftColl_ApplyDamage |  | retain |
| ftColl_80076764 | ftColl_AppendEnvironmentDamageLog |  | retain |
| ftColl_80076808 | ftColl_RegisterHitboxVictim |  | retain |
| ftColl_800768A0 | ftColl_InitHitboxVictims |  | retain |
| ftColl_8007699C | ftColl_ResolveClank |  | retain |
| ftColl_80076CBC | ftColl_FighterShieldHit |  | retain |
| ftColl_80076ED8 | ftColl_ProcessFighterHit |  | retain |
| ftColl_80077464 | ftColl_ReflectItemHit |  | retain |
| ftColl_80077688 | ftColl_ItemShieldHit |  | retain |
| ftColl_80077970 | ftColl_ResolveItemHitboxClank |  | retain |
| ftColl_80077C60 | ftColl_ProcessItemHit |  | retain |
| ftColl_80078384 | ftColl_PlayHitSFX |  | retain |
| ftColl_80078488 | ftColl_PlayPhantomHitSFX |  | retain |
| ftColl_800784B4 | ftColl_PlayClankSFX |  | retain |
| ftColl_80078538 | ftColl_SpawnNormalHitEffects |  | retain |
| ftColl_8007861C | ftColl_RecordHitAttribution |  | retain |
| ftColl_80078710 | ftColl_RecordFighterHit | ftColl_RecordFighterHitAttribution | supersede |
| ftColl_80078754 | ftColl_RegisterGrabHit |  | unresolved |
| ftColl_800787B4 | ftColl_ProcessItemHit | ftColl_RecordItemHitAttribution | supersede |
| ftColl_800788D4 | ftColl_RecordUnattributedHit |  | retain |
| ftColl_8007891C | ftColl_RecordFighterHit |  | retain |
| ftColl_80078998 | ftColl_ItemHitFighter |  | retain |
| ftColl_80078A2C | ftColl_FindGrabVictim |  | retain |
| ftColl_80078C70 | ftColl_CheckFighterHit |  | retain |
| ftColl_8007925C | ftColl_ProcessItemCollisions |  | retain |
| ftColl_80079AB0 | ftColl_CalcKnockbackWithRatios |  | retain |
| ftColl_80079C70 | ftColl_CalcKnockback | ftColl_CalcFighterKnockback | supersede |
| ftColl_80079EA8 | ftColl_CalcKnockback | ftColl_CalcUnmodifiedKnockback | supersede |
| ftColl_8007A06C | ftColl_ResolveDamageLog |  | retain |
| ftColl_8007AB48 | ftColl_ResolveDamageLog0 |  | retain |
| ftColl_8007AB80 | ftColl_ResolvePhantomDamageLog |  | unresolved |
| ftColl_8007ABD0 | ftColl_SetHitboxDamage |  | retain |
| ftColl_8007AC68 | ftColl_IsKnockbackAngleInRange |  | retain |
| ftColl_8007AC9C | ftColl_SetHitboxKnockbackAngle |  | retain |
| ftColl_8007AD18 | ftColl_UpdateHitboxPosition |  | retain |
| ftColl_8007AE80 | ftColl_UpdateHitboxPositions |  | retain |
| ftColl_8007AEE0 | ftColl_EnableShieldHitPositionUpdate |  | retain |
| ftColl_8007AEF8 | ftColl_EnableReflectHitPosUpdate |  | retain |
| ftColl_8007AF10 | ftColl_EnableAbsorbHitPosUpdate |  | retain |
| ftColl_8007AF28 | ftColl_InvalidateHurtboxPositions |  | retain |
| ftColl_8007AF60 | ftColl_UpdateDynamicsHitPositions |  | retain |
| ftColl_8007AFC8 | ftColl_DisableHitbox |  | retain |
| ftColl_8007AFF8 | ftColl_DisableAllHitboxes |  | retain |
| ftColl_8007B064 | ftColl_EnableHitbox |  | retain |
| ftColl_8007B0C0 | ftColl_SetHurtboxState |  | retain |
| ftColl_8007B128 | ftCollisionSetHitStatus |  | retain |
| ftColl_8007B1B8 | ftColl_CreateShieldHit |  | retain |
| ftColl_8007B320 | ftColl_Init |  | retain |
| ftColl_8007B4E0 | ftColl_HurtboxReset |  | retain |
| ftColl_8007B62C | ftColl_SetBodyCollisionState |  | retain |
| ftColl_8007B6A0 | ftColl_SetIntangible |  | retain |
| ftColl_8007B6EC | ftColl_ResetHitStatus |  | retain |
| ftColl_8007B760 | ftColl_SetIntangibility |  | retain |
| ftColl_8007B7A4 | ftColl_SetInvincibilityTimer |  | retain |
| ftColl_8007B7FC | ftColl_StarInit |  | retain |
| ftColl_8007B868 | ftColl_GetHitStatus | ftColl_GetFighterHitStatus | supersede |
| ftColl_8007B8A8 | ftColl_SetHitboxPosition |  | retain |
| ftColl_8007B8CC | ftColl_SetThrownHitboxOwner |  | retain |
| ftColl_8007B8E8 | ftColl_ClearThrownHitboxOwner |  | retain |
| ftColl_8007BA0C | ftColl_ProcessBuryThings |  | retain |
| ftColl_8007BAC0 | ftColl_ProcessStageDynamics |  | retain |
| ftColl_8007BBCC | ftColl_GetLipstickDamage |  | retain |
| ftColl_8007BC90 | ftColl_FindGrabItemTarget |  | retain |
| ftColl_8007BE3C | ftColl_ProcessDelayedDamage |  | retain |
| ftColl_CreateAbsorbHit |  |  | canonical retained |
| ftColl_CreateReflectHit |  |  | canonical retained |
| ftColl_GetWindOffsetVec |  |  | canonical retained |
| ftColl_HurtboxInit |  |  | canonical retained |

## Reviewed final render

Root promoted 38 reviewed fact operations. [Final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftcoll/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftcoll/staged-completion.json), and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/7e66761ea1e0a04c8d7baad25412b1d7914e8f7f8f8c53d43831c670d5623fd6/2026-09-08T15-03-14.628Z-0fe857d7-aa50-45f9-aa8e-e8ff9f1918a0.receipt.json). Final-render SHA256: `e5576981240fbd62d139bc6de939b7bac95b453fa7e9a74e65a82ef834651904`. Canonical source unchanged.
