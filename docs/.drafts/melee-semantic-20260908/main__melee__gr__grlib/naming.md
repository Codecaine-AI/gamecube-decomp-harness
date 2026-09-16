# Grlib Naming

Canonical names remain authoritative. No new names or name clears proposed.

| Canonical Symbol | Inherited Alias | Disposition |
|---|---|---|
| grLib_801C96E8 | grLib_IsMapObjectAnimationFinished | unresolved |
| grLib_801C96F8 | grLib_CreateGeneratorAtPosition | unresolved |
| grLib_801C97DC | grLib_SpawnParticleEffect | unresolved |
| grLib_801C9808 | grLib_CreateGenerator_Attach | unresolved |
| grLib_801C9834 | grLib_RemoveGenerator | unresolved |
| grLib_801C9854 | grLib_DestroyGeneratorsForJObjTree | unresolved |
| grLib_801C9874 | grLib_RemoveGenerator | unresolved |
| grLib_801C98A0 | grLib_RemoveGeneratorsByJObj | unresolved |
| grLib_801C9908 | grLib_DestroyGeneratorsForJObjAll | unresolved |
| grLib_801C99C0 | grLib_SpawnParticleEffect | unresolved |
| grLib_801C9A10 | grLib_GetStagePositionCache | unresolved |
| grLib_801C9A70 | grLib_GetStagePosition | unresolved |
| grLib_801C9B20 | grLib_InitDynamics | unresolved |
| grLib_801C9B6C | grLib_ReleaseDynamics | unresolved |
| grLib_801C9BC8 | grLib_UpdateLoopingCameraQuake | retain |
| grLib_801C9C40 | grLib_UpdateFiniteCameraQuake | retain |
| grLib_801C9CEC | grLib_CreateCameraQuake | retain |
| grLib_801C9E40 | grLib_GetTrophyDropCounter | unresolved |
| grLib_801C9E50 | grLib_SetTrophyDropCounter | unresolved |
| grLib_801C9E60 | grLib_GetStageMotionVector | unresolved |
| grLib_801C9EE8 | grLib_IsPointInsideEntityCollision | retain |

Two SpawnParticleEffect aliases collide, as do two RemoveGenerator aliases. Shared callee semantics remain unverified. The three camera-quake aids are supported by their local constructor and callbacks; the occupancy aid is supported by the owned inline predicate.
