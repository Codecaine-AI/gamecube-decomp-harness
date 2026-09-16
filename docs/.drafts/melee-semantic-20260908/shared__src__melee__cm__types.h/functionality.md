# Camera shared types

`src/melee/cm/types.h` declares camera-related records, not executable camera logic. `CmSubject` has next/previous links, state and flags, a timer, positions, facing and current/target extents; the header alone does not establish state transitions or lifetime management (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/types.h#L10-L30). Transform records pair interest, position and FOV with target values; bounds, directional limits with a callback, quake records and debug-camera fields provide related data shapes (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/types.h#L32-L83).

`Camera` aggregates an object pointer, mode, color and clipping fields, two transform records, translation, quake counters and a two-by-sixteen quake array, pause-camera fields and numerous unknown fields, bitfields and unions. The tentative comment on `transform_copy` does not prove it is unused. Union alternatives must remain alternatives rather than a single inferred runtime type. The source contains `ASSERT_SIZE(struct Camera, 0x39C)`; this is a source assertion, not independent compiled-layout evidence (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/types.h#L85-L184).

The remainder declares an unnamed float-field record, nine callbacks taking `void*` and returning void, and camera inputs with four float stick components and two 64-bit button fields. Callback index meanings and input update semantics are not specified here (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/types.h#L186-L260).

Both canonical and rendered views were read completely. The renderer reports three parse errors, zero substitutions, and marks ASSERT_SIZE parse-uncertain; its function-name-only view does not independently validate field names. No supported correction is identified from this header. The frozen baseline contains no subjects, facts or links, so no retention IDs or proposals are required.

Status: researched; no-change lead bypass; independent review and live promotion pending.
