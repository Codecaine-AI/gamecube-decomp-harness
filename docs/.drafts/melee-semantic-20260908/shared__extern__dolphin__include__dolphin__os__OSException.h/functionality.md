## OS exception interface

Fully reviewed canonical and rendered `extern/dolphin/include/dolphin/os/OSException.h` (62 lines). The rendered view has no substitutions or parse errors. There are no owned subjects, baseline facts, or links to disposition; no knowledge changes are proposed.

The header defines exception identifiers from SYSTEM_RESET (0) through MEMORY_PROTECTION (15). `__OS_EXCEPTION_MAX` is THERMAL_INTERRUPT + 1, hence also 15; this must not be silently interpreted as a count including memory protection. The original `__OS_EXCEPTION_PERFORMACE_MONITOR` spelling is preserved. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSException.h#L11-L27)

`__OSException` is a `u8`. Handlers receive an exception identifier and an `OSContext*` and return void. The setter accepts an identifier and handler; both setter and getter return a handler pointer. These are declarations, not evidence of registration bounds, previous-handler return behavior, storage, or context lifetime. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSException.h#L29-L35)

`OS_EXCEPTION_SAVE_GPRS(context)` emits assembly saving r0–r2 and r6–r31, then GQR1–GQR7 using r0 as scratch. It does not itself save r3–r5 or GQR0 and is not a complete context-save operation. Its symbolic context offsets do not establish compiled layout. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSException.h#L37-L55)

Status: synthesized; independent review and live promotion pending.
