# Fighter Action Naming

Canonical symbols stay unchanged. Aliases remain descriptive hypotheses.

| Canonical Target | Existing Alias | Proposed Alias | Disposition |
|---|---|---|---|
| .data | Action command tables |  | retain |
| .sdata2 |  |  | canonical retained |
| ftAction_80071028 | ftAction_SpawnGFX |  | retain |
| ftAction_800711DC | ftAction_SkipGFXSpawn |  | retain |
| ftAction_8007121C | ftAction_CreateHitbox |  | retain |
| ftAction_800715EC | ftAction_SkipHitboxSpawn |  | retain |
| ftAction_8007162C | ftAction_SetHitboxDamage |  | retain |
| ftAction_8007168C | ftAction_SkipAdjustHitboxDamage |  | retain |
| ftAction_8007169C | ftAction_SetHitboxScale |  | retain |
| ftAction_800716F8 | ftAction_SkipSetHitboxScale |  | retain |
| ftAction_80071708 | ftAction_SetHitboxFlags |  | retain |
| ftAction_80071774 | ftAction_SkipSetHitboxFlags |  | retain |
| ftAction_80071784 | ftAction_SetThrowFlags | ftAction_DisableHitbox | supersede |
| ftAction_800717C8 | ftAction_SkipSetThrowFlags | ftAction_SkipDisableHitbox | supersede |
| ftAction_800717D8 | ftAction_ClearAllHitboxes |  | retain |
| ftAction_80071810 | ftAction_SkipClearHitboxes |  | retain |
| ftAction_80071820 | ftAction_SetCmdVar |  | retain |
| ftAction_800718A4 | ftAction_SetThrowFlag |  | retain |
| ftAction_80071908 |  |  | canonical retained |
| ftAction_8007192C |  |  | canonical retained |
| ftAction_80071950 | ftAction_AllowInterrupt |  | retain |
| ftAction_80071974 |  |  | canonical retained |
| ftAction_80071998 | ftAction_HandleGroundOrAirState |  | retain |
| ftAction_80071A14 | ftAction_SetBodyCollisionState |  | retain |
| ftAction_80071A58 | ftAction_SetAllHurtCapsuleState |  | retain |
| ftAction_80071A9C | ftAction_SetHurtState |  | retain |
| ftAction_80071AE8 | ftAction_SetJabCombo |  | retain |
| ftAction_80071B28 | ftAction_SetJabRapid |  | retain |
| ftAction_80071B50 | ftAction_SoundEffect |  | retain |
| ftAction_80071CA4 | ftAction_SkipSFXCommand |  | retain |
| ftAction_80071CCC | ftAction_PlaySmashSFX |  | unresolved |
| ftAction_80071D30 |  | ftAction_SkipSmashSFX | new inferred alias |
| ftAction_80071D40 | ftAction_SetDObjFlags |  | retain |
| ftAction_80071D94 | ftAction_RestoreModelParts |  | unresolved |
| ftAction_80071DCC | ftAction_ClearModelPartSelections |  | unresolved |
| ftAction_80071E04 | ftAction_SetThrowHitbox |  | retain |
| ftAction_80071F0C | ftAction_SkipSetThrowHitbox |  | retain |
| ftAction_80071F34 | ftAction_SetItemVisibility |  | unresolved |
| ftAction_80071F78 | ftAction_SetArticleVisibility |  | retain |
| ftAction_80071FA0 | ftAction_SetFighterVisibility |  | retain |
| ftAction_80071FC8 | ftAction_PseudoRandomSFX |  | retain |
| ftAction_800722C8 | ftAction_SkipPseudoRandomSFX |  | retain |
| ftAction_80072320 | ftAction_StageSFX |  | retain |
| ftAction_800726C0 | ftAction_SkipStageSFX |  | retain |
| ftAction_800726F4 | ftAction_SetTextureAnim |  | retain |
| ftAction_800727C8 | ftAction_PartAnim |  | retain |
| ftAction_8007283C | ftAction_ApplyPartAnimImmediate |  | retain |
| ftAction_80072894 |  |  | canonical retained |
| ftAction_800728F8 | ftAction_CommandRumble |  | retain |
| ftAction_8007296C | ftAction_SkipThrowRumble | ftAction_SkipRumble | supersede |
| ftAction_8007297C | ftAction_RemoveRumbleId |  | retain |
| ftAction_800729C4 | ftAction_SkipRemoveRumbleId |  | retain |
| ftAction_800729D4 | ftAction_HandleSwordBladeScale |  | retain |
| ftAction_80072A4C | ftAction_SkipSwordBladeScale |  | retain |
| ftAction_80072A5C | ftAction_StartColAnim |  | retain |
| ftAction_80072AAC |  |  | canonical retained |
| ftAction_80072ABC | ftAction_ResetColAnim |  | retain |
| ftAction_80072B04 | ftAction_SkipResetColAnim |  | retain |
| ftAction_80072B14 |  |  | canonical retained |
| ftAction_80072B3C |  |  | canonical retained |
| ftAction_80072B84 |  |  | canonical retained |
| ftAction_80072B94 | ftAction_ToggleDynamicBonePart |  | retain |
| ftAction_80072BE4 | ftAction_SkipToggleDynamicBonePart |  | retain |
| ftAction_80072BF4 | ftAction_SelfDamage |  | retain |
| ftAction_80072C5C |  |  | canonical retained |
| ftAction_80072C6C | ftAction_SetGroundPoseFlags |  | retain |
| ftAction_80072CB0 |  |  | canonical retained |
| ftAction_80072CD8 | ftAction_HandleFootstepEffect |  | retain |
| ftAction_80072E24 | ftAction_SkipFootstepEffectCommand |  | retain |
| ftAction_80072E4C | ftAction_GroundImpactEffect |  | retain |
| ftAction_80072FE0 | ftAction_SkipGroundImpactEffect |  | retain |
| ftAction_80073008 | ftAction_SmashCharge |  | retain |
| ftAction_8007309C | ftAction_SkipSmashCharge |  | retain |
| ftAction_800730B8 | ftAction_SetRefractState |  | retain |
| ftAction_80073108 | ftAction_SkipColorAnimCommand |  | retain |
| ftAction_80073118 |  |  | canonical retained |
| ftAction_8007320C |  |  | canonical retained |
| ftAction_80073240 |  |  | canonical retained |
| ftAction_80073354 |  |  | canonical retained |
| ftAction_8007349C | ftAction_UpdateCmd |  | retain |

## Reviewed final render

Root promoted 49 reviewed facts to the live KB. [Final-render receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftaction/final-render.json) records the exact reviewed rendered pages; [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftaction/staged-completion.json) and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/39f7eeb57ca3c07905facea68058ba1265c7427fbd5c7e29bf705bfd7010b9e7/2026-09-08T14-53-20.501Z-e2765be9-c3d0-4bf8-b19b-c8309c0493dc.receipt.json) establish application. Final-render SHA256: `a7953950af3b598ef78beb0c1efc018b9270620057f9bd30afa316e4166ca5c7`. Canonical source remains unchanged.
