# Fox Target Test stage controller

`grtfox.c` defines the `Gr_Kind_TFox` descriptor using `/GrTFx.dat`, three populated ground-object callback records, and a final zero record. `grtfox.h` exports `grTFx_StageData`. Source declarations do not establish compiled `.data` or `.sbss` membership.

## Initialization and lifecycle

`grTFox_80220B84` caches `Ground_GetYakumonoParam()`, clears `stage_info.unk8C.b4`, sets `b5`, and requests ground objects 0, 1, and 2 in order. It then calls four shared Ground setup routines. The object helper indexes the callback table without checking bounds, obtains the corresponding GObj, and either performs setup or reports failure. Its caller ignores the returned pointer and continues after a failed lookup.

The actual shared setup clears two Ground callback fields, registers a display link, installs a non-null callback3, invokes a non-null initializer, and schedules a non-null process callback. It does **not** consume callback1 or the callback-record flags. Consequently, predicate table membership is not proof of runtime predicate installation or dispatch.

The demo and load hooks are empty. The start hook calls `grZakoGenerator_801CAE04(NULL)` and ignores its result. That shared routine creates a generator GObj, schedules its process, and stores shared state; GObj creation failure reports an error, frees the allocated data, and returns NULL. This is not sufficient evidence to identify the call as target spawning.

Evidence: [controller setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfox.c#L43-L108), [actual callback setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L33-L62), [generator creation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grzakogenerator.c#L313-L328).

## Ground-object behavior

Object 0 initializes animation using its Ground map ID and animation-set index 0. Its process and callback3 bodies are empty. Objects 1 and 2 use `Ground_JObjInline1`, which delegates joint/map setup and animation initialization. Their process callbacks call `Ground_801C2FE0`; object 2 first calls `lb_800115F4`. All three callback1 bodies return false, and all callback3 bodies are empty. Only record 2 stores `(1 << 31) | (1 << 30)`; the reviewed setup does not interpret those bits.

The animation helper selects the first child when present, optionally replaces joint data, resets material state, replaces animations from optional archive arrays, requests frame zero, conditionally applies an animation flag, and evaluates the hierarchy. Archive availability is asserted. Internal object IDs do not identify visible course components.

Evidence: [object callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfox.c#L110-L158), [joint initializer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L30), [animation implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/granime.c#L988-L1048).

## Collision dynamics and shadow policy

`grTFox_80220E5C` rejects line ID -1 locally, resolves other IDs through `mpJointFromLine`, and requires joint 1. Floor, ceiling, right-wall, and left-wall kinds select `unk0`, `unk4`, `unk8`, and `unkC`, respectively. Other joint results or unsupported kinds return NULL. Validation of other malformed IDs belongs to the called collision APIs, not this wrapper. Eligible branches dereference the cached parameter table without checking initialization; selected entries may themselves be NULL. The pointer is assigned during initialization and is not cleared or freed by this unit, so valid backing-storage lifetime is an external requirement.

The shadow-check callback ignores its position, integer, and JObj arguments and returns true. It never rejects a query through this hook; that does not guarantee rendering elsewhere. The separate parameterless stage predicate always returns false.

Evidence: [lookup and shadow bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtfox.c#L160-L187), [descriptor fields](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L157-L171), [callback interfaces](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L194-L196).

## Semantic and rendered review

Existing lifecycle, object-slot, process, and dynamics-lookup names fit the canonical behavior and are retained. No cosmetic renaming is proposed. The renderer reports shadowed bindings for `grTFox_80220C2C` and `grTFox_80220E5C`; the latter's supported inferred name remains valid despite not being substituted. Foreign rendered helper names were not treated as proof of their behavior. Corrections address predicate-dispatch assumptions, overly broad invalid-input guarantees, and target-generator conflation. Compiled section claims remain explicitly unresolved.

Status: synthesized; independent review and live promotion pending.
