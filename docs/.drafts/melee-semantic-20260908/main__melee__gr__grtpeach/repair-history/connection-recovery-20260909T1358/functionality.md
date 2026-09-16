# grtpeach Functionality

TPeach exports grTPe_StageData with /GrTPe.dat and three populated callback records plus a zero fourth row. Every local function has a prior static declaration. The callback table also has external linkage. The header only declares the exported descriptor.

## Entry points

| Canonical | Behavior |
|---|---|
| grTPeach_802228B4 | Empty demo hook with bool parameter; shared StageData demo slot uses int. No local work. |
| grTPeach_802228B8 | Calls Ground_InitTargetStage with grTPeach_80222958. Shared inline sets bits 4/5 to false/true, requests IDs 0, 1, 2 ignoring returns, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. |
| grTpeach_UnkStage0_OnLoad | Empty load hook; returns without calls or mutation. |
| grTpeach_UnkStage0_OnStart | Calls grZakoGenerator_801CAE04(NULL) once, ignoring its result. No local branch, retry or success guarantee. |
| grTPeach_80222950 | Parameterless descriptor callback4 returns false. |
| grTPeach_80222958 | Forms a callback-row pointer using unchecked signed index, retrieves the same ID with Ground_GetStageGObj, invokes Ground_SetupStageCallbacks only if nonnull, else reports the failure, and returns the lookup result. Shared setup installs callback3, invokes on_init and schedules gobj_proc at priority 4; it does not consume callback1 or flags. The zero fourth row does not bound arbitrary IDs. |
| grTPeach_80222A40 | Passes gobj, GET_GROUND(gobj)->map_id and false to grAnime_801C8138, without local pointer guards. |
| grTPeach_80222A6C | Object 0 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTPeach_80222A74 | Object 0 process hook is empty. |
| grTPeach_80222A78 | Object 0 callback3 is the fourth function slot and is empty. |
| grTPeach_80222A7C | Object 2 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| grTPeach_80222ACC | Object 2 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTPeach_80222AD4 | Calls lb_800115F4 first, then Ground_801C2FE0(gobj), unconditionally. |
| grTPeach_80222B08 | Object 2 callback3 is empty. |
| grTPeach_80222B0C | Object 1 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| grTPeach_80222B5C | Object 1 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTPeach_80222B64 | Calls Ground_801C2FE0 with the unchanged gobj pointer. |
| grTPeach_80222B84 | Object 1 callback3 is empty. |
| grTPeach_80222B88 | Touch-line descriptor callback ignores enum_t and always returns NULL. |
| grTPeach_80222B90 | Shadow-eligibility callback ignores Vec3*, int and HSD_JObj* and always returns true; performs no rendering. |

## Boundaries

Shared setup clears x8/xC, registers GX linkage, installs callback3, invokes on_init and schedules gobj_proc. It does not consume callback1 or flags. A zero fourth row does not prove terminator semantics or validate an index. The factory returns NULL after lookup failure; initialization ignores that return and continues. No caller-local target spawning success, animation success or recovery guarantee is established.

All 188 displayed canonical and rendered lines are reviewed. Zero parse errors. The touch-line alias and setup factory are shadowed bindings in the renderer. Six stageGObj aliases plus setupStageCallbacks collide across TUs; canonical OnLoad shortening is also deferred. Demo bool differs from the shared int slot. Compiled section and empty register entities are accounted for without invented semantics.
