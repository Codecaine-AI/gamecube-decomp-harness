## MetroTRK command dispatcher

This unit implements debugger request routing, not gameplay. Its header declares two public DSError-returning routines, and the canonical and rendered function names already fit their behavior.

`gTRKDispatchTable` contains 34 callbacks: indices 0–31 are callable, including `TRKDoUnsupported` for unsupported slots; indices 32–33 are NULL. `TRKInitializeDispatcher` unconditionally assigns 32 to the mutable `u32 gTRKDispatchTableSize` and returns `kNoError`. The bound is initially zero by static-storage initialization. These are source-level object observations, not independently verified compiled section-layout claims.

`TRKDispatchMessage` initializes its result to `kDispatchError`, requests buffer position zero, reads an unsigned command byte, and calls the indexed handler only when the byte is below the active bound. The handler receives the same buffer, and its return value becomes the dispatch result. A decoded command outside the bound leaves `kDispatchError` unchanged. The dispatcher ignores both buffer-operation return values and has no separate NULL-callback check; exclusion of the trailing NULL entries relies on the initialized bound.

The nub initializer calls dispatcher initialization after successful endian, event-queue and message-buffer setup, before subsequent success-gated UART, serial-handler and target setup. The request-event caller resolves the event's buffer ID and synchronously dispatches that buffer, ignoring the returned status. The surrounding loop subsequently destroys the event; dispatch itself neither allocates nor releases the buffer.

All 26 existing facts and four links are explicitly retained in the checkpoint. One additional fact records the previously omitted unchecked buffer-operation behavior.

Status: synthesized; independent review and live promotion pending.
