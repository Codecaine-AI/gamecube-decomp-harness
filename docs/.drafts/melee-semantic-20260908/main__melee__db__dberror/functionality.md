# dberror semantic review

## Responsibility
This unit provides floating-point status masking, HSD-panic and OS-error diagnostic callbacks, and debugger-guarded crash-handler setup. Existing function names fit the canonical behavior; no cosmetic renames are proposed. Supported retained facts and links are adopted unchanged from the complete research ledger.

## Floating-point state
`db_ClearFPUExceptions` writes the current MSR OR 0x900, obtains the current OS context, saves FPU state, masks its FPSCR with 0x000FFFFF, and reloads that state. It does not restore the incoming MSR. This is a precise mask operation, not a reset of all floating-point state or a guarantee against subsequent exceptions. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L16-L25)

## Diagnostic callbacks
Both callbacks clear user pre/post-retrace hooks, call `lb_80019A48`, print `db_build_timestamp` using "%s\n", request a stack trace with limit 16, pass 0x1388 to `hsd_80397DFC`, store `DbLevel`, and hand the context to `hsd_80397DA4`. The OS callback first extracts two variadic integers, DSISR followed by DAR, and additionally reports exception details. Its `va_end` occurs after the context handoff returns. The local bodies have no diagnostic guard; this does not imply that callees always return or lack exceptional branches. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L27-L60)

The inherited helper review establishes that the stack walker can stop before 16 entries. The code-line reporter branches on the error and register bits; it does not establish source-debug line lookup. [Reporting helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L824-L959)

`hsd_80397DFC` stores `(size + 0xF) >> 4`, so the supplied 0x1388 produces 313; no time unit is established. `hsd_80397DA4` creates and resumes a worker with the original context, an automatic `OSThread`, and a global stack. That supports the rendered thread-start hypothesis but leaves scheduler-dependent thread/context lifetime unresolved. The OS dispatcher disables scheduling around the callback and has a non-recoverable-context branch that bypasses it. [Console helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2850-L2868) [Dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSError.c#L53-L75)

## Installation
With a nonzero debugger-presence result, setup performs no allocation or registration. Otherwise it requests 0x2000 bytes at alignment 4, initializes the report buffer, registers the HSD panic callback, and attempts OS registrations over indices 0–15, skipping 4, 7, 8 and 9. There is no local once-only flag, allocation-failure check, cleanup or restoration of previous handlers. The buffer initializer retains the pointer and size globally, clears the buffer and installs an HSD report callback. [Setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L62-L81) [Buffer initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_393C.c#L88-L98)

Successful installation through index 15 is NOT established. The pinned SDK declares `OSErrorTable[15]`; `OSSetErrorHandler` asserts `error < __OS_EXCEPTION_MAX`, and that maximum equals 15. Consequently the final attempted registration fails with the assertion active; without it, the shown C indexes outside the declared table. Reconciliation with the linked SDK/build is deferred. [Table](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSError.c#L10-L10) [Setter](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSError.c#L42-L50) [Boundary constants](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSException.h#L25-L27)

## Rendered view and compiled-data uncertainty
The inherited research covers all nine subjects, 28 facts and six links. The lead independently checked all 82 canonical and rendered lines and every proposed fact's cited source. The rendered view reports three parse errors and substitutes the thread-start name in only one of two identical canonical calls. Its report-console initialization hypothesis is independently consistent with the buffer initializer. Neither rendering nor C literal spelling proves `.sdata` attribution, shared storage, section size/alignment or trailing padding. All four section facts and its relationship remain explicitly unresolved; no compiled-layout write is proposed. Historical object observations cannot substitute for revision-matched source/object equivalence and relocation evidence.


Status: synthesized; independent review and live promotion pending.
