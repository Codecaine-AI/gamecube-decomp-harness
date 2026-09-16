## Effect shared types
`src/melee/ef/types.h` declares the effect subsystem's shared records and constants; it contains no executable dispatch implementation.

- `EF_SpawnKind` assigns values 0–8 to joint attachment, world-position placement, offset and additional-parameter variants, and camera shake. The canonical comments describe argument forwarding to `efSync_Spawn`; mode 8 instead documents `Camera_RequestQuake`. These are documented contracts, not independently verified runtime behavior ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/types.h#L11-L38)).
- Load kinds are async=0 and sync=1. Scale inheritance and expiry each use 0/1 constants. State constants are active=0, entering-pause=1, paused=2, and async=0x80; the header alone does not establish legal combinations or transitions ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/types.h#L40-L57)).
- `EF_Effect` carries list linkage, effect and parent objects, attachment joint, callback and user data, callback-dependent parameters, lifetime, and flags. `is_async` is separate from `state_flags`; `x2A` and `x2B` remain unexplained. `EF_EffectDesc` pairs a floating-point lifetime with a static-model descriptor ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/types.h#L59-L79)).
- `EF_QueuedEffect` stores linkage, spawn kind, graphics ID, joint, vector parameters, and two extra floats. `EF_DAT_Entry` stores archive and table names plus a loaded-data pointer. The header also declares an opaque allocation record and source-level size assertions; no compiled layout is established by this review ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/types.h#L81-L101)).

Canonical and rendered text were read completely. The rendered view applies no substitutions and supplies no independent semantic evidence. Existing names and comments present no supported correction within this header's evidence. There are no baseline subjects, facts, or links to retain or amend.

Status: synthesized; independent review and live promotion pending.
