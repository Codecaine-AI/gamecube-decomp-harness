# Mewtwo Target Test stage controller

The unit registers `Gr_Kind_TMewtwo`, `/GrTMt.dat`, lifecycle hooks, collision-dynamics lookup and a shadow-render predicate. Its header exports only `grTMewtwo_StageData`.

Initialization caches `Ground_GetYakumonoParam()`, clears `stage_info.unk8C.b4`, sets `b5`, and requests Ground objects 0, 1 and 2 in that order. Each index selects both the object and its callback record. A missing object produces a diagnostic and returns NULL; initialization ignores that result and continues with subsequent objects and shared setup. The helper does not check index bounds. Shared Ground routines initialize camera/blast bounds and target-stage objects separately from stage-start manager creation.

The callback table has three populated rows and a final null row. Object 0 initializes animation set 0 and has an empty process callback. Objects 1 and 2 delegate initialization to `Ground_JObjInline1`; their process callbacks call `Ground_801C2FE0`, with object 2 first calling `lb_800115F4`. All three callback1 predicates return false, and all callback3 bodies are empty. Object 2 alone has `(1 << 30) | (1 << 31)` flags. Callback3 must not be confused with gobj_proc: `grTMewtwo_80222434` occupies the former.

The demo-init and load hooks are empty. Stage start calls `grZakoGenerator_801CAE04(NULL)` once and ignores its result. That callee creates and schedules a shared generated-object manager, publishing descriptor/data pointers on success. Failed GObj creation reports an error, frees newly allocated data and returns NULL. This is not immediate target creation, and the Mewtwo wrapper performs no recovery or manager cleanup.

The dynamics callback rejects line ID -1, resolves a map joint and accepts only joints 0 and 1. Floor, ceiling, right-wall and left-wall kinds select fields x0/x4/x8/xC for joint 0 and x10/x14/x18/x1C for joint 1. Other joints or kinds return NULL. Supported selections dereference the cached parameter pointer without a null check; initialization and parameter lifetime are prerequisites. The field names are not reliable byte offsets: the declaration orders xC before x8 and x1C before x18.

The stage-level callback4 returns false. The shadow predicate ignores all three arguments and always returns true; this approves its query, not necessarily every downstream rendering operation.

## Semantic review

Existing function-name hypotheses fit the canonical callback slots and bodies and are retained without stylistic renaming. The renderer reports `shadowed_binding` for `setupStageCallbacks` and `grTMewtwo_GetDynamicsDescForLine`, leaving their canonical names visible; this is a rendering limitation, not contrary behavioral evidence. The header has no substitutions or parse issues.

Corrections narrow unsupported compiled-section claims, distinguish shared manager startup from target spawning, and replace the ambiguous description of a void callback as non-returning. The incorrect no-op-process link for callback3 is rejected. Source declarations do not establish compiled section membership or layout.

Status: researched; no-change lead bypass; independent review and live promotion pending.
