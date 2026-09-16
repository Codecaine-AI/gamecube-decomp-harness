## Shrine / Temple stage controller

`grSh_StageData` registers `Gr_Kind_Shrine`, `/GrSh.dat`, three object callback rows, and the lifecycle, touch-line and shadow-check callbacks. The header exports this descriptor. The canonical ground-kind declaration independently identifies Shrine as Hyrule Temple.

### Initialization and object behavior

`grShrine_80201C64` stores the return from `Ground_GetYakumonoParam` in the opaque file-local pointer; the rest of this unit does not consume it. It independently attempts object IDs 0, 1 and 2, calls two shared Ground setup routines, then passes the local vector `{0.5, 0, 0}`, selector `-1`, scalar arguments `0.5` and `0`, angle `M_PI / 3`, and bounds `-10000, 10000, 10000, -10000` to `lb_80011A50`.

The indexed helper selects a callback row before obtaining the stage GObj. A non-null result receives shared callback setup; a null result is reported and returned. Initialization ignores these helper results and continues. There is no local index validation; only the three local calls with IDs 0–2 establish its intended domain.

The canonical shared installer clears two Ground callback fields, registers display handling, copies a non-null callback3, invokes a non-null initializer synchronously, and schedules a non-null process at priority 4. It does **not** consume callback1 or the callback-row flags. Thus table membership must not be conflated with demonstrated predicate dispatch.

- Object 0 selects animation index 0. Its process and callback3 are empty.
- Object 1 selects animation index 0 and writes `x11_flags.b012 = 2`. Its process and callback3 are empty.
- Object 2 calls `Ground_801C2ED0`, selects animation index 0, registers the empty `grShrine_80201E98` event through `Ground_801C10B8`, calls `Ground_801C2FE0`, then sets `x10_flags.b5`. Its process calls `Ground_801C2FE0` followed by `lb_800115F4`; callback3 is empty.
- All three callback1 bodies return false without inspecting their argument. Their actual dispatch is not established by the inspected setup path.

The callback rows contain flags 0, 0 and `(1 << 30) | (1 << 31)`. Neither these bits nor the numeric Ground-field settings are assigned an unevidenced gameplay meaning. Visible identities of the three Temple components remain unknown.

The animation callee independently confirms archive-backed joint/material/shape resource selection, optional first-child selection and joint reset, replacement of existing animations, a frame-zero request, conditional animation flags and immediate evaluation. Its source uses a `bool` selector while testing it against zero and using it as an index; Shrine supplies literal zero, so no broader selector domain is inferred.

### Lifecycle and cross-file lifetimes

The demo and load callbacks are empty; the stage predicate always returns false. The concrete demo callback takes `bool`, whereas `StageData.on_demo_init` is declared with `int`; the unused parameter does not justify a stronger semantic interpretation.

The start hook makes one unguarded `grZakoGenerator_801CAE04(NULL)` call and ignores its return. The callee creates and schedules a shared generated-object manager and publishes its descriptor/data pointers on success. GObj-creation failure reports an error, frees the newly allocated data and returns NULL; Shrine performs no recovery. This does not establish an immediate Temple-specific enemy or hazard spawn.

Deferred registration allocates a node containing the saved GObj and event, then prepends it to `stage_info.x6A4`; allocation failure reports and panics. Common start dispatch first calls the stage-level start hook, then invokes queued events, frees their nodes and clears the queue. Shrine's queued endpoint performs no work. Queue-node cleanup is not evidence of destruction of the saved GObj.

### Dynamics and shadow eligibility

The touch-line callback ignores its line identifier and always returns NULL. The shadow callback obtains the supplied joint's origin with `lb_8000B1CC(joint, NULL, &b)` and returns true only for `a->y > b.y`; equal, lower and unordered comparisons return false. The integer argument is unused. There is no direct wrapper write to caller inputs or local persistent state, but the parented-joint helper path invokes `HSD_JObjSetupMatrix`, so a blanket claim of no delegated joint-state effects is unwarranted. Valid position and joint pointers are required: a null joint with this null local-offset argument is not a supported fallback.

### Semantic review outcome

Existing role-based names generally fit the canonical callback slots and bodies; inconsistent Ground/GObj/Map naming alone does not warrant churn. Six factual corrections are proposed. Other supported knowledge is explicitly retained in the checkpoint ledger. Eleven section-associated facts remain unresolved because source declarations and literals do not prove compiled section membership, order, size or alignment. The rendered C view is complete and parseable but reports `shadowed_binding` for `grShrine_80201D20` and `grShrine_80201F44`; this is a renderer limitation, not behavioral evidence. Rendered external names describing wind, directional fields or collision updates are not used as independent proof of those finer semantics.

Status: synthesized; independent review and live promotion pending.
