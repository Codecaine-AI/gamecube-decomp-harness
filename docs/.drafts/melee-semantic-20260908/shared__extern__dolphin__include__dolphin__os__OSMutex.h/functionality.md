## OSMutex.h

This header declares the Dolphin OS mutex and condition-variable interface. It includes `OSThread.h`, uses an include guard, and wraps declarations in C linkage for C++ consumers.

`OSMutex` contains an `OSThreadQueue queue`, an `OSThread *thread`, an `s32 count`, and an `OSMutexLink link`. The source includes offset comments, but this review does not treat those comments as compiled-layout evidence. `OSCond` contains a single `OSThreadQueue queue` ([canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSMutex.h#L10-L21)).

The interface declares mutex initialization, locking, unlocking, and a `BOOL`-returning try-lock operation. It also declares condition initialization, waiting with a condition and mutex argument, and signaling ([canonical prototypes](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSMutex.h#L23-L29)). No function bodies are present: recursion/count semantics, try-lock return values, scheduling behavior, exceptional branches, and ownership or wait lifetimes cannot be established from this header alone.

All 36 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors and agrees with the canonical declarations. The frozen baseline contains no subjects, facts, or links; therefore there are no existing knowledge records to retain or correct, and no supported naming correction is proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
