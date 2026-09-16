# grtsamus Functionality

TSamus exports grTSs_StageData with /GrTSs.dat and three populated callback records plus a zero fourth row. Every local function has internal linkage through a prior static declaration. The header only declares the exported descriptor.

## Entry points

| Canonical | Behavior |
|---|---|
| grTSamus_OnDemoInit | Empty demo hook with int parameter, agreeing with the shared StageData demo slot. No local work. |
| grTSamus_OnInit | Calls Ground_InitTargetStage with grTSamus_80223624. Shared inline sets bits 4/5 to false/true, requests IDs 0, 1, 2 ignoring returns, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. |
| grTSamus_OnLoad | Empty load hook; returns without calls or mutation. |
| grTSamus_OnStart | Calls grZakoGenerator_801CAE04(NULL) once, ignoring its result. No local branch, retry or success guarantee. |
| grTSamus_8022361C | Parameterless descriptor callback4 returns false. |
| grTSamus_80223624 | Forms a callback-row pointer using unchecked signed gobj_id, retrieves the same ID with Ground_GetStageGObj, invokes Ground_SetupStageCallbacks only if nonnull, else reports the failure, and returns the lookup result. Shared setup installs callback3, invokes on_init and schedules gobj_proc at priority 4; it does not consume callback1 or flags. The zero fourth row does not bound arbitrary IDs. |
| grTSamus_8022370C | Reads Ground from gobj user_data and passes gobj, map_id and 0 to grAnime_801C8138 without pointer guards. |
| grTSamus_80223738 | Object 0 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTSamus_80223740 | Object 0 process hook is empty. |
| grTSamus_80223744 | Object 0 callback3 is the fourth function slot and is empty. |
| grTSamus_80223748 | Object 2 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| grTSamus_80223798 | Object 2 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTSamus_802237A0 | Calls lb_800115F4 first, then Ground_801C2FE0(gobj), unconditionally. |
| grTSamus_802237D4 | Object 2 callback3 is empty. |
| grTSamus_802237D8 | Object 1 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| grTSamus_80223828 | Object 1 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTSamus_80223830 | Calls Ground_801C2FE0 with the unchanged gobj pointer. |
| grTSamus_80223850 | Object 1 callback3 is empty. |
| grTSamus_OnTouchLine | Touch-line descriptor callback ignores enum_t and always returns NULL. |
| grTSamus_OnCheckShadowRender | Shadow-eligibility callback ignores Vec3*, int and HSD_JObj* and always returns true; performs no rendering. |

## Boundaries

Shared setup clears x8/xC, registers GX linkage, installs callback3, invokes on_init and schedules gobj_proc. It does not consume callback1 or flags. A zero fourth row does not prove terminator semantics or validate an index. The factory returns NULL after lookup failure; initialization ignores that return and continues. No caller-local target spawning success, animation success or recovery guarantee is established.

All 178 displayed canonical and rendered lines are reviewed. Zero parse errors. The touch-line alias and setup factory are shadowed bindings in the renderer. Six generic aliases remain deferred; canonical lifecycle names are preserved. Demo int agrees with the shared slot. Compiled section and empty register entities are accounted for without invented semantics.
