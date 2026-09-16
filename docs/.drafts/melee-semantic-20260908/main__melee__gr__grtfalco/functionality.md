# TFalco semantic review

The unit registers `Gr_Kind_TFalco` with `/GrTFc.dat`, a `StageData` descriptor and three populated ground-object callback records followed by a zero record. The header exports only the descriptor. Source declarations do not establish compiled `.data` or `.sbss` placement or exhaustive section contents.

## Lifecycle and object processing

Initialization caches `Ground_GetYakumonoParam()`, clears `stage_info.unk8C.b4`, sets `b5`, and requests callback setup for object IDs 0, 1 and 2 before four shared Ground calls. The installer uses the same ID for object lookup and callback-table indexing. A missing object produces a diagnostic and a NULL return; initialization ignores that result and continues. No local bounds check exists, although all local calls use populated IDs.

The shared inline clears two Ground callbacks, installs a GX link, stores callback3, invokes on_init and schedules gobj_proc when present. It does not consume callback1 or the record flags. Object 0 selects animation 0 using its map ID; objects 1 and 2 perform joint/map setup and select animation 0 through another inline. Object 0's process is empty. Object 1 delegates to `Ground_801C2FE0`; object 2 first calls `lb_800115F4` and then delegates. All three callback1 bodies return false, and all callback3 bodies are empty. Callback3 is the fourth function field, not the third hook. Object 2 alone has flags `(1 << 30) | (1 << 31)`; their gameplay meaning is not inferred here.

Demo initialization and load are inert. The stage-level callback4 always returns false. Start makes one unconditional request to `grZakoGenerator_801CAE04(NULL)`: NULL is a spawn-description pointer, not an owner object. The shared creator can fail, freeing its allocated data and returning NULL; on success it schedules processing and publishes configuration/data globally. This caller ignores the returned GObj. Common generator startup must not be conflated with Target Test target creation.

## Dynamics and lifetime

The dynamics callback rejects line sentinel -1, accepts only joint 0, and selects cached slots for floor, ceiling, right wall and left wall. Other joint/kind outcomes return NULL. Eligible lookups dereference the cached parameter pointer without a NULL check. The module neither allocates nor frees the parameter block and supplies no teardown or lifetime validation. Four separate slots do not establish four different runtime pointer values.

The shadow callback ignores all arguments and returns true. It never vetoes a query through this hook, but does not guarantee final shadow rendering. The integer parameter remains a selector-or-index uncertainty.

## Name and explanation assessment

Retain `grTFalco_OnInit`, `grTFalco_OnDemoInit`, `grTFalco_GetDynamicsDescForLine` and `grTFalco_OnCheckShadowRender`: canonical signatures, bodies and shared descriptor fields independently support these roles. Existing object-indexed names appropriately avoid unsupported visible-platform identities. The rendered C view has no parse errors, but the dynamics name and `setupStageCallbacks` report `shadowed_binding`; substitutions and external rendered names are not self-proving evidence. The header view is unchanged.

The checkpoint explicitly retains 107 baseline facts and 20 links, supersedes six factual explanations, and leaves one link explanation unresolved. Corrections address unsupported compiled-section wording, the generator argument and role, and callback numbering. Additional proposals document the unchecked cache lifetime and actual inline installation behavior.

Status: researched; no-change lead bypass; independent review and live promotion pending.
