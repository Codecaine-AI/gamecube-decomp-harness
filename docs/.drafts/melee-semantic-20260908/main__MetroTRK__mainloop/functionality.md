## MetroTRK main loop

`mainloop.c` implements the debugger nub event pump and three small helpers; `mainloop.h` declares their matching interfaces. Canonical and rendered views agree, with no function-name substitutions or renderer errors. The existing names and all 19 baseline facts remain supported; no semantic rewrite is warranted.

- `TRKHandleRequestEvent` reads `ev->fMessageBufferID`, resolves it with `TRKGetBuffer`, and passes the resulting pointer directly to `TRKDispatchMessage`. It adds no validation or local state changes.
- `TRKHandleSupportEvent` accepts but ignores its event pointer and unconditionally calls `TRKTargetSupportRequest`.
- `TRKIdle` calls `TRKTargetContinue` only when `TRKTargetStopped` returns false.
- `TRKNubMainLoop` initializes shutdown and prior-poll flags to false. Every successful event retrieval clears the prior-poll flag. Requests invoke the request helper; breakpoint and exception events call `TRKTargetInterrupt`; support events invoke the support helper; shutdown sets the exit flag; null events perform no service. Unrecognized event types likewise reach cleanup without a service call. Every dequeued event, including shutdown, reaches `TRKDestructEvent` after the switch before the next loop test.
- With no event, the loop polls input if the prior-poll flag is false or the byte addressed by `gTRKInputPendingPtr` is nonzero. Short-circuit evaluation skips that byte read when the flag is false. Polling sets the flag; otherwise the loop idles and clears it. Thus pending input can cause repeated polling rather than strict poll/idle alternation.

Event destruction remains the loop's responsibility after synchronous handling. This unit shows the buffer lookup and downstream calls but does not establish callee-internal allocation, release, or target-resumption mechanics. Event types are interpreted symbolically; no numeric enum values or compiled layout are inferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/mainloop.c#L9-L61 and code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/mainloop.h#L1-L12.

Status: researched; no-change lead bypass; independent review and live promotion pending.
