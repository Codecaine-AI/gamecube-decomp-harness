# grtmars Functionality

TMars exports grTMs_StageData with /GrTMs.dat and three populated callback records plus a zero fourth row. Every local function is static. The header only declares the exported descriptor.

## Entry points

| Canonical | Behavior |
|---|---|
| grTMars_80221EF4 | Empty demo hook with bool parameter; shared StageData demo slot uses int. No local work. |
| grTMars_80221EF8 | Calls Ground_InitTargetStage with setupStageCallbacks. Shared inline sets bits 4/5 to false/true, requests IDs 0, 1, 2 ignoring returns, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. |
| grTmars_UnkStage0_OnLoad | Empty load hook; returns without calls or mutation. |
| grTmars_UnkStage0_OnStart | Calls grZakoGenerator_801CAE04(NULL) once, ignoring its result. No local branch, retry or success guarantee. |
| grTMars_80221F90 | Parameterless descriptor callback4 returns false. |
| setupStageCallbacks | Forms a callback-row pointer using unchecked signed gobj_id, retrieves the same ID with Ground_GetStageGObj, invokes Ground_SetupStageCallbacks only if nonnull, else reports the failure, and returns the lookup result. Shared setup installs callback3, invokes on_init and schedules gobj_proc at priority 4; it does not consume callback1 or flags. The zero fourth row does not bound arbitrary IDs. |
| stageGObj0_OnInit | Reads Ground from gobj user_data and passes gobj, map_id and 0 to grAnime_801C8138 without pointer guards. |
| stageGObj0_Callback1 | Object 0 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| stageGObj0_GObjProc | Object 0 process hook is empty. |
| stageGObj0_Callback3 | Object 0 callback3 is the fourth function slot and is empty. |
| stageGObj2_OnInit | Object 2 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| stageGObj2_Callback1 | Object 2 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| stageGObj2_GObjProc | Calls lb_800115F4 first, then Ground_801C2FE0(gobj), unconditionally. |
| stageGObj2_Callback3 | Object 2 callback3 is empty. |
| stageGObj1_OnInit | Object 1 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| stageGObj1_Callback1 | Object 1 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| stageGObj1_GObjProc | Calls Ground_801C2FE0 with the unchanged gobj pointer. |
| stageGObj1_Callback3 | Object 1 callback3 is empty. |
| grTMars_802221C8 | Touch-line descriptor callback ignores enum_t and always returns NULL. |
| grTMars_802221D0 | Shadow-eligibility callback ignores Vec3*, int and HSD_JObj* and always returns true; performs no rendering. |

## Boundaries

Shared setup clears x8/xC, registers GX linkage, installs callback3, invokes on_init and schedules gobj_proc. It does not consume callback1 or flags. A zero fourth row does not prove terminator semantics or validate an index. The factory returns NULL after lookup failure; initialization ignores that return and continues. No caller-local target spawning success, animation success or recovery guarantee is established.

All 174 displayed canonical and rendered lines are reviewed. Zero parse errors. The touch-line alias and setup factory are shadowed bindings in the renderer. Four local aliases remain hypotheses; canonical generic names are not renamed. Demo bool differs from the shared int slot. Compiled section and empty register entities are accounted for without invented semantics.
