# grfigure2 Functionality

Figure2 exports a StageData descriptor for /GrEF2.dat and three callback records. Initialization requests objects0,2,1, continues after lookup failures and runs common Ground routines. OnStart makes one generator call withNULL. The stored yakumono parameter pointer has no local consumer.

## Entry Points

| Canonical | Behavior |
|---|---|
| grFigure2_8020E274 | Stores Ground_GetYakumonoParam result in unused local static pointer, clears stage_info bit4 and sets bit5, requests objects0,2,1 in order and ignores failure returns, then calls Ground_801C39C0 and Ground_801C3BB4. |
| grFigure2_OnLoad | Empty canonical load hook; no state or calls. |
| grFigure2_OnStart | Calls grZakoGenerator_801CAE04 withNULL and ignores result; no local guard or recovery. Void return does not mean non-returning control flow. |
| grFigure2_8020E30C | StageData callback4 always returns false without reading state; meaning of the consumer condition is unresolved. |
| grFigure2_8020E314 | Selects callback table by unchecked signed ID before Ground_GetStageGObj. Nonnull object is passed with record to Ground_SetupStageCallbacks; null logs OSReport and returnsNULL. Local callers use IDs0,2,1. |
| grFigure2_8020E3FC | Object0 init reads user_data as Ground and calls grAnime_801C8138(gobj,map_id,0). No local pointer guard; detailed animation changes belong to callee review. |
| grFigure2_8020E428 | Object0 callback1 ignores argument and returns false; shared setup does not itself consume callback1. |
| grFigure2_8020E430 | Object0 gobj_proc is empty. |
| grFigure2_8020E434 | Object0 callback3 is empty. |
| grFigure2_8020E438 | Object1 init reads map_id and forwards hsd_obj,map_id to Ground_801C2ED0. No local guard or additional writes. |
| grFigure2_8020E464 | Object1 callback1 ignores argument and returns false; shared setup does not itself consume callback1. |
| grFigure2_8020E46C | Object1 process calls Ground_801C2FE0(gobj) followed by lb_800115F4 with no arguments. No local branches or state writes. |
| grFigure2_8020E490 | Object1 callback3 is empty. |
| grFigure2_8020E494 | Object2 init forwards gobj to Ground_JObjInline1. Shared inline reads Ground and JObj, calls Ground_801C2ED0 then grAnime_801C8138 with map_id and animation index0. |
| grFigure2_8020E4E4 | Object2 callback1 ignores argument and returns false; no state writes or calls. |
| grFigure2_8020E4EC | Object2 gobj_proc is empty. |
| grFigure2_8020E4F0 | Object2 callback3 is empty. |
| grFigure2_8020E4F4 | StageData on_touch_line slot callback ignores enum_t argument and returnsNULL DynamicsDesc pointer. No descriptor lookup or state change occurs. |
| grFigure2_8020E4FC | StageData on_check_shadow_render callback ignores Vec3 pointer,int,HSD_JObj pointer and returns true. No actual drawing or collision computation occurs. |

## Boundaries

StageCallbacks records contain callback1 predicates and flags, but the shared setup path read here uses neither. It installs callback3, invokes initialization and schedules gobj_proc; it does not prove all record slots run. Constant false predicates should not be described as collision results. The constant true callback occupies the shadow-render slot and draws nothing itself.

Figure1 and Figure2 share creation order and NULL generator call. Figure2 references the empty Figure1 demo callback; shared types declare its slot with int while the function definition uses bool. This packet does not alter that signature or claim ownership of Figure1. Detailed Ground, animation, generator, event and visual asset semantics remain family work.

## Coverage

All168 displayed lines in two owned files were reviewed in canonical and rendered views, including empty hooks. All21targets,39subjects and inherited facts are in findings.json. Zero parse errors; GetDynamicsDesc pointer-return alias is shadowed_binding. Two section targets await pinned object mapping. No source or shared KB changes.
