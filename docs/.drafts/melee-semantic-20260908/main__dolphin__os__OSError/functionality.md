## OSError semantic review

Inherited research establishes coverage of all 115 canonical and rendered lines, 18 subjects, 38 facts and 16 links. The lead independently inspected the complete owned source and the relevant Melee callback and registration code, and reconciled both proposal artifacts. The rendered view has no substitutions or parse errors; canonical function names remain appropriate.

- `OSReport` forwards a format string and variadic arguments to `vprintf`, finalizes the argument list, and returns normally. Its canonical parameter type is `char*`; read-only use does not change that declared type.
- `OSPanic` disables interrupts, prints the supplied message and source location, follows stack back-chain pointers for at most 16 frames, stopping earlier at null or `0xffffffff`, then calls `PPCHalt`. The walk is bounded, not a general validation of frame addresses.
- `OSSetErrorHandler` reads one global callback slot, writes its replacement, and returns the previous callback. NULL clears a slot. The source contains an assertion against `__OS_EXCEPTION_MAX`, but no synchronization or atomic exchange primitive.
- `__OSUnhandledException` bypasses callbacks when saved `MSR_RI` is clear. Otherwise it invokes a registered callback with exception, context, DSISR and DAR while scheduling is disabled; if the callback returns, it enables scheduling, reschedules and loads the context. A recoverable decrementer exception also loads its context without a handler. Remaining paths report the context, fault registers, time base, exception-specific access or DMA details, and last-interrupt state before halting. Exception-name annotations are DEBUG-only.
- Registrations persist across calls. Melee's no-debugger setup installs its callback for indices 0–15 except 4, 7, 8 and 9; that callback consumes fault arguments and produces game diagnostics. This exposes a discrepancy with the authored `OSErrorTable[15]` declaration, not proof of a 16-entry compiled allocation.

Supported existing behavior, names and semantic relationships are explicitly retained through the inherited dispositions. Two factual clarifications are proposed. Section identities, literal layout and padding remain unresolved without compiled evidence. Emulator log-category and cache-registration claims remain deferred.

Status: synthesized; independent review and live promotion pending.
