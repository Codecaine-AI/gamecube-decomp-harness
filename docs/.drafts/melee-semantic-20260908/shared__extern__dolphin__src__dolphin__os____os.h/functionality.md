## Internal Dolphin OS declarations

`extern/dolphin/src/dolphin/os/__os.h` is an include-guarded internal interface header importing `<dolphin/os.h>`. It declares OS initialization hooks, debugger and exception interfaces, the volatile current-heap variable, interrupt interfaces and diagnostic arrays, memory protection, mutex checks, and reset interfaces ([lines 1–58](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/__os.h#L1-L58)). The `D ONLY` annotations are comments, not conditional compilation guards here.

The remaining interfaces cover RTC access, SRAM locking/unlocking with a `commit` parameter, synchronous and asynchronous ROM reads, boot mode and wireless IDs, system-call initialization, thread scheduling and priorities, time conversion, runtime startup/shutdown, and clock support ([lines 60–118](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/__os.h#L60-L118)). These declarations do not establish return-status meanings, lock ownership or lifetime, asynchronous buffer/callback lifetimes, exceptional branches, or numeric boot-mode semantics. Startup declarations contain source-level `.init` annotations; no compiled placement or layout is established.

The complete rendered view preserves the canonical names with zero substitutions. There are no owned subjects, facts, or links to revise or retain. No supported semantic correction or useful fact proposal was identified from this declaration-only evidence.

Status: synthesized; independent review and live promotion pending.
