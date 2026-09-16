## Linker placeholder source
`extern/dolphin/src/dolphin/stub.c` explicitly supplies symbols only to satisfy the linker. `TEXT_STUB(name)` expands to an empty `void name(void)` definition; `DATA_STUB(name)` would declare an `int`, but is unused in this file ([canonical lines 1–77](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/stub.c#L1-L77)).

All listed symbols use the empty-function macro, including startup, arena/stack and initialization-table names, arithmetic helpers, floating-register save/restore names, DSP and MetroTRK names, `main`, and standard-library names. They do not implement the operations suggested by those names. In particular, arena/stack/table spellings here are not evidence of data objects, and these placeholder signatures are not evidence of the actual implementations’ interfaces. There are no branches, state transitions, calls, or resource lifetimes in these bodies. No compiled section or layout conclusions are drawn.

The complete rendered view matches the canonical source, with zero substitutions and zero parse errors. Its cross-file symbol associations do not establish real implementation behavior. Both baseline enumerations are empty: there are no owned subjects, facts, or links to correct or retain, and no justified proposal is made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
