# Baselib Debug Functionality

Local research complete; independent proposal review and application pending. Revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete canonical/rendered C64 and H39, ten targets and twenty-three subjects reviewed.

## Entry Points

| Function | Behavior | Evidence |
|---|---|---|
| `report_func` | Optional observer receives buffer/count before saved stdout writer; writer result discarded, wrapper returns 0. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L20-L28` |
| `HSD_LogInit` | Captures writer only while logFunc is NULL, installs wrapper, clears stdout error. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L30-L37` |
| `__assert` | Reports failed expression then calls HSD_Panic with file, line and empty message. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L39-L43` |
| `HSD_Panic` | With callback, saves context fields, reports location and invokes callback; OSPanic follows on continuation. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L45-L53` |
| `HSD_SetReportCallback` | Replaces reportCallback, accepting NULL. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L55-L58` |
| `HSD_SetPanicCallback` | Replaces panicCallback, accepting NULL. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L60-L63` |

## Stdout and Callback Contract

report_func implements the MSL __io_proc signature. It gives the optional ReportCallback the buffer pointer and current count by value, then passes the original handle, buffer, count pointer and idle callback to logFunc. The writer can change the shared count, but its integer status is ignored. No local NULL or reentry guard protects logFunc or observer dispatch. A callback that does not return prevents forwarding; one that logs through this stream can reenter it. Foreign signature evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/stdio.h#L60-L95`.

HSD_LogInit preserves a captured non-NULL writer across repeated calls. This property assumes the initial stdout writer was valid. If it was NULL, logFunc remains NULL after first installation; a subsequent call can capture report_func and create recursive forwarding. Each call reinstalls the wrapper and clears stdout.state.error. There is no restore operation here.

## Panic and Assertion Contract

HSD_Panic itself has three fixed arguments. PanicCallback is declared variadic, but the call supplies only OSContext*. The optional callback branch saves into one shared global context object, reports message/file/line and invokes the callback. OSPanic is reached only if all preceding calls return. There is no context isolation or recursion guard. The callback pointer is not snapshotted before reporting, so callback-slot mutation during hooked reporting is not protected.

OSSaveContext stores selected registers and control fields, not a complete fresh CPU/FPU snapshot. Its exact writes were read at `code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSContext.c#L240-L274`. The trailing 16 bytes in the owned DebugContext declaration have no owned access. Nested panics can reuse the same context buffer.

The message is printed as a %s argument in the optional location report, but is then forwarded unchanged as the format string of variadic OSPanic with no additional arguments. Callers must supply a compatible format. OSPanic disables interrupts, prints its message/location and a bounded stack-chain report, then calls PPCHalt. `code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSError.c#L12-L40`.

__assert receives an already-failed expression; it does not evaluate the condition. Header macros choose the failure branch. HSD_ASSERT stringizes the condition, HSD_ASSERTMSG uses the supplied message only on failure, and HSD_ASSERTREPORT performs the extra OSReport before __assert. MUST_MATCH passes the explicit line parameter; the other branch uses __LINE__. Both __assert and HSD_Panic are declared noreturn. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L8-L36`.

## Game Handler and Lifetime

db_SetupCrashHandler installs fn_HSDPanicHandler when no external debugger is present. The handler disables user retrace callbacks, reports a build timestamp and stack trace, stores debug level and starts debug-console support. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L27-L37` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L62-L80`. Its endpoint creates and resumes a thread; this review does not establish scheduling, display completion or when OSPanic is subsequently reached. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2852-L2858`.

## Data Sections

| Section | Inspected Contents | Correction or Limit |
|---|---|---|
| `.bss` | 728-byte DebugContext symbol in both existing objects | Context plus unknown tail; no full-register snapshot guarantee. |
| `.sbss` | reportCallback, panicCallback, logFunc at offsets 0,4,8 | Target/generated sizes 16/12 differ by padding. |
| `.data` | Assertion-expression and location report formats | Two dedicated formats; target/generated sizes 48/46. |
| `.sdata` | Empty message literal | Target/generated sizes 8/1; empty message is not a third dedicated .data literal. |

The old .data fact conflated the empty literal with the format pool. Existing object section bytes and symbol records support the corrected split. `compiled-artifacts.json` records exact SHA-256 hashes; all section fact rationales retain them. These observations do not establish build freshness or binary parity. No builds or matching were run.

## Review Packet

All 49 existing facts have ID/version dispositions; 18 retain and 31 supersede. The proposal has 63 writes: 49 refreshes, 12 parameter-purpose facts and two added state-behavior facts. All six canonical function names remain, with no inferred aliases proposed.

Both owned files reached EOF with zero parser errors and zero substitutions. The renderer identifies cb as shadowing an unrelated foreign symbol; no semantic relationship is inferred. Initial SDK source paths under src/dolphin were absent and were corrected to pinned extern/dolphin paths. Exact successful reads, resolved exceptions, source hashes and timestamps are in `coverage.json`.

Foreign MSL/OSContext types, callback discipline, thread behavior and formatting requirements remain family-scoped. `family-followups.json` preserves those boundaries. No source, shared KB, UI or Git publication changes occurred.

## TU Lead Verification

Complete canonical and rendered C/header reviewed. Checked observer-before-writer order and discarded status, NULL-first-writer repeat-init hazard, panic callback re-read after reporting, shared context and OSPanic continuation, nonvariadic HSD_Panic versus variadic callback typedef, and assertion macro line selection. All target proposals scanned; foreign register-capture/runtime claims and compiled sections remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

Reviewed live application: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/3f260b7760467c28205a0c76fa1ad7b54c90977de0e89a3bf6c1ca3113e9db61/2026-09-08T15-05-45.254Z-75824dbc-c241-4c80-a1e5-5f7a78b562e5.receipt.json); [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__debug/final-render.json).
