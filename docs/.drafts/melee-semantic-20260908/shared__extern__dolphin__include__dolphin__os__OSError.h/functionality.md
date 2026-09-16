### OSError.h
This header defines the Dolphin OS error-handler interface. `OSError` is a `u16`; `OSErrorHandler` is a variadic function pointer returning void and taking an error identifier and `OSContext*` as its fixed arguments ([source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSError.h#L4-L11)).

Error constants span 0–14, from system reset through thermal interrupt, with `OS_ERROR_MAX` equal to 15. The original identifier `OS_ERROR_PERFORMACE_MONITOR` is preserved exactly. The header declares an external 15-entry `OSErrorTable` and `OSSetErrorHandler`, which accepts an error identifier and handler and returns an `OSErrorHandler` ([source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSError.h#L13-L32)). These declarations do not establish setter implementation details, return-value meaning, invalid-index handling, callback lifetime, or table initialization.

The complete rendered view matches the canonical header, with no substitutions or parse errors. The unchanged setter binding is owned elsewhere. There are no owned subjects, baseline facts, or links to revise or retain; no semantic correction is proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
