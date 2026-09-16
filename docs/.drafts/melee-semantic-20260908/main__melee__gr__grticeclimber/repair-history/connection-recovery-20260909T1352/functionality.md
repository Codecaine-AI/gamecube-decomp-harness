# Ice Climbers Target Test ground controller

## Registration and lifecycle
`grTIc_StageData` registers `Gr_Kind_TIceclimber`, `/GrTIc.dat`, three populated ground-object callback records and a final zero record. Object 2's record carries bits 30 and 31. The header exports the stage descriptor. These are source-level declarations, not proof of compiled section membership or layout.

The initialization callback passes `setupStageCallbacks` to `Ground_InitTargetStage`. The shared inline requests objects 0, 1 and 2, then performs common target-stage setup. The installer directly indexes `stage_callbacks[id]`, retrieves the ground object, installs callbacks on success, and otherwise reports the failed ID and returns NULL. It has no local index bounds check. The shared installer invokes initialization synchronously and registers the process callback; it does not consume Callback1 or scan for the final zero record in this path.

The demo-init and load callbacks are empty. Stage start calls `grZakoGenerator_801CAE04(NULL)`. The parameterless descriptor query always returns false. The DynamicsDesc-returning callback always returns NULL, and the three-argument Boolean callback always returns true without inspecting its arguments.

## Ground objects
- Object 0 selects map animation 0. Its process and fourth callback are empty, and Callback1 returns false.
- Object 1 performs `Ground_JObjInline1`, whose canonical definition performs joint setup and selects map animation 0. Its process forwards the object to `Ground_801C2FE0`; its other callbacks return false or do nothing.
- Object 2 performs the same shared joint setup, calls `grAnime_801C7FF8` with `(69, 2, 1, 0.0F, 1.0F)`, and creates material-backed scenery proxies. Its process calls `lb_800115F4()` before `Ground_801C2FE0(gobj)`. No additional meanings are assigned to the numeric animation arguments here.

## Material creation, persistent binding and failure paths
`grTIc_803E8B5C` contains **40 candidate indices** before its first -1, followed by a trailing zero that the loop does not visit. The helper resolves each candidate against ground object 2 and skips resolution results of -1. It obtains an `HSD_JObj*`, not a position vector, and passes that pointer, the Ground record and the damage callback to `grMaterial_801C8CFC`.

The material wrapper forwards to `it_802E6AEC`. That constructor derives the initial position from the joint and retains the joint pointer, Ground pointer and callbacks in the item. Joint-bound mode is recorded as 1; later physics reads the retained joint to synchronize position, scale and rotation. The alternate position-backed mode is 2, and the physics routine reports and loops indefinitely for another mode. Thus the stage joint must remain valid for later item use; creation is not merely a one-time position copy. No joint ownership transfer or reference-count policy is established by these reads.

A missing joint reaches the constructor with no alternate position, causing a NULL result. Item allocation may also fail. The local helper configures only non-NULL results: hurt-capsule endpoints become `(-1,0,0)` and `(1,0,0)`, with scale 4. The following wrapper calls `it_802756E0`, which sets `xD0C` to 0 and calls `it_802714C0`; this review preserves those concrete operations rather than assigning a complete meaning to the numeric state.

## Damage response and objective distinction
The generic material damage-received dispatcher calls the stored callback only when both callback and Ground pointers are non-NULL. It supplies the item, Ground, a computed vector, recorded fighter object and `xCA0`; the local callback consumes only the item argument.

The callback hides the stored stage-joint hierarchy, derives its world position, spawns effect 0x445, requests `QuakeKind_Small`, calls `Ground_801C53EC(310)`, and invokes `grMaterial_801C8CDC`. That wrapper forwards to `Item_8026A8EC`. Exact removal timing and joint cleanup are not established here. The callback has no local guard or timer.

These generic material proxies implement breakable scenery, not the separately created Mato objective targets. The shared target initializer calls `Ground_801C4210`, which creates `It_Kind_Mato` objects from shared stage joints and initializes objective counts. The local 40-candidate material loop must not be described as creating 40 or 41 objective targets.

## Semantic review
The existing init/demo-init names fit canonical StageData fields independently of the rendered view. The DynamicsDesc name remains a conservative interface description. `grTIceClimber_Target_DmgReceived` is misleading beside the distinct Mato path; `grTIceClimber_Material_DmgReceived` preserves the demonstrated event while identifying the correct subsystem. Existing callback and controller knowledge is explicitly retained in the checkpoint except for the listed corrections and unresolved section claims.

Both owned canonical and rendered files, all 49 subjects and all 27 links were reviewed. The rendered C view reports no parse errors but leaves `setupStageCallbacks` and the DynamicsDesc hypothesis shadowed; parameter, field and section names are outside its substitution scope. Rendered names were not used as self-proving evidence.

Status: synthesized; independent review and live promotion pending.
