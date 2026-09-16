# grtganon Functionality

TGanon exports grTGn_StageData with /GrTGn.dat and three populated callback records plus a zero fourth row. All functions have external linkage. Header declares all 20 functions and the descriptor; the callback table is also externally linked.

## Entry points

| Canonical | Behavior |
|---|---|
| grTGanon_802246D8 | Empty demo hook with bool parameter; shared StageData demo slot uses int. No local work. |
| grTGanon_802246DC | Caches Ground_GetYakumonoParam, sets stage bits 4/5 to false/true, requests IDs 0, 1, 2 through grTGanon_80224784 ignoring returns, then calls Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. |
| grTganon_UnkStage0_OnLoad | Empty load hook; returns without calls or mutation. |
| grTganon_UnkStage0_OnStart | Calls grZakoGenerator_801CAE04(NULL) once, ignoring its result. No local branch, retry or success guarantee. |
| grTGanon_8022477C | Parameterless descriptor callback4 returns false. |
| grTGanon_80224784 | Forms a callback-row pointer using unchecked signed id, retrieves the same ID with Ground_GetStageGObj, invokes Ground_SetupStageCallbacks only if nonnull, else reports the failure, and returns the lookup result. Shared setup installs callback3, invokes on_init and schedules gobj_proc at priority 4; it does not consume callback1 or flags. The zero fourth row does not bound arbitrary IDs. |
| grTGanon_8022486C | Obtains Ground through HSD_GObjGetUserData and passes gobj, map_id and 0 to grAnime_801C8138 without pointer guards. |
| grTGanon_80224898 | Object 0 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTGanon_802248A0 | Object 0 process hook is empty. |
| grTGanon_802248A4 | Object 0 callback3 is the fourth function slot and is empty. |
| grTGanon_802248A8 | Object 2 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| grTGanon_802248F8 | Object 2 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTGanon_80224900 | Calls lb_800115F4 first, then Ground_801C2FE0(gobj), unconditionally. |
| grTGanon_80224934 | Object 2 callback3 is empty. |
| grTGanon_80224938 | Object 1 invokes Ground_JObjInline1, which calls Ground_801C2ED0 with JObj/map_id and then grAnime_801C8138 with gobj/map_id/0. |
| grTGanon_80224988 | Object 1 callback1 ignores input and returns false; shared setup does not install or invoke this slot. |
| grTGanon_80224990 | Calls Ground_801C2FE0 with the unchanged gobj pointer. |
| grTGanon_802249B0 | Object 1 callback3 is empty. |
| grTGanon_802249B4 | Touch-line rejects input -1 locally, requires mpJointFromLine to return 0, then returns cached x0 for Ceiling, x4 for RightWall, or x8 for LeftWall. Floor, other kinds and other joints return NULL. Other invalid IDs are delegated to mplib. The parameter cache is not null-checked, and selected entries may themselves be NULL. |
| grTGanon_80224A4C | Shadow-eligibility callback ignores Vec3*, int and HSD_JObj* and always returns true; performs no rendering. |

## Boundaries

Shared setup clears x8/xC, registers GX linkage, installs callback3, invokes on_init and schedules gobj_proc. It does not consume callback1 or flags. A zero fourth row does not prove terminator semantics or validate an index. The factory returns NULL after lookup failure; initialization ignores that return and continues. No caller-local target spawning success, animation success or recovery guarantee is established.

All 224 displayed canonical and rendered lines are reviewed. Zero parse errors. Touch-line alias substitutes in C but is shadowed in the header; the header factory binding is shadowed. Seven generic aliases and canonical OnStart shortening remain deferred. Demo bool differs from the shared int slot. Compiled section and empty register entities are accounted for without invented semantics.
