# Runtime Crash Diagnostics

Draft at frozen revision `c302741689bd67c361cd7faadb221df3193992c3`. Only `src/melee/db/dberror.c` is manifest-owned. [coverage.json](coverage.json) indexes complete canonical/rendered snapshots, input hashes and individual fact dispositions. Rendered aliases remain hypotheses; three parse errors and two substitutions were resolved by reading canonical source.

## Installation

`db_SetupCrashHandler` does nothing if debugger presence is nonzero. Otherwise it allocates 0x2000 bytes aligned to four, initializes the report buffer, registers the HSD panic callback, and replaces OS handlers for 0..15 except 4,7,8,9. Every eligible call repeats this sequence. There is no once-only guard or restoration of replaced callbacks. [src/melee/db/dberror.c:62-81](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L62-L81)

The allocator advances the low arena without checking capacity; the console initializer clears its state and supplied buffer and replaces the HSD report callback. Debugger presence also reads false if the SDK interface pointer is null. [OSArena.c:35-46](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSArena.c#L35-L46) [hsd_393C.c:88-98](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_393C.c#L88-L98) [db.c:18-24](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/db/db.c#L18-L24)

## Crash callbacks

Both callbacks clear only the HSD user pre/post retrace hooks, cancel the lb_0195 alarm if active, print the build timestamp with `%s\n`, report up to 16 stack entries, store the size-derived value 313 and current DbLevel, and pass the same context to the thread helper. The OS callback additionally extracts DSISR followed by DAR from unnamed int arguments and reports exception details. [src/melee/db/dberror.c:27-60](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L27-L60) [video.c:25-48](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L25-L48) [lb_0195.c:161-170](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L161-L170)

The size setter computes `(size + 15) >> 4`; calling it with 5000 does not establish a 5000-millisecond delay. The context helper calls OSCreateThread and OSResumeThread without checking creation success. It contains no explicit nonreturning transfer. [debugconsole_main.c:2852-2868](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2852-L2868)

The HSD caller saves a processor context before invoking its callback and continues to OSPanic if it returns. The inspected OS dispatcher invokes its registered handler only when the saved recoverability bit is set; scheduling is disabled around that invocation, then reenabled before rescheduling and reloading the saved context. Registration alone does not mean every exception reaches this callback or that its debug thread immediately runs. [debug.c:45-53](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L45-L53) [OSError.c:53-69](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSError.c#L53-L69)

## FPU helper

`db_ClearFPUExceptions` is independent of setup and debugger presence. It writes `MSR | 0x900`, saves the current FPU context, masks its FPSCR with `0x000FFFFF`, and reloads it. The old MSR is not restored. The mask clears the stored high twelve bits while retaining the low twenty; it is not a blanket promise to clear every exception-related field. The save additionally marks FPU state and refreshes FPRs and conditional paired-single values. [src/melee/db/dberror.c:16-25](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L16-L25) [OSContext.c:11-196](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSContext.c#L11-L196)

## Evidence limits

Existing source `.sdata` contains four bytes `25 73 0a 00`; the split section is eight bytes with four extra zero bytes. [object-evidence.json](object-evidence.json) records exact object hashes; no build or source-object equivalence check was performed.

No new names are proposed. All six outgoing diagnostic relationships are retained with exact baseline records. Full debug-thread lifetime, global exception recovery, the later meaning of the size-derived global and full foreign file ownership remain outside this review. Independent review and shared-KB application remain pending.
