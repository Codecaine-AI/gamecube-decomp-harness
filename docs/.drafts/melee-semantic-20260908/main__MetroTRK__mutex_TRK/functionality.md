## MetroTRK mutex API

`TRKInitializeMutex`, `TRKAcquireMutex`, and `TRKReleaseMutex` each accept an unused `void*` and unconditionally return `kNoError`. They do not dereference storage, call other routines, wait, validate ownership, or change synchronization state. The header declares the same signatures and defines `DSMutex` as `unsigned int`; this typedef does not establish a concrete pointee layout for the opaque API arguments.

Message-buffer callers pass `fMutex` member addresses; event-queue callers pass the queue object's address. They ignore mutex return statuses and retain nominal initialize/acquire/release sequences. The hooks themselves supply no exclusion. Buffer allocation still releases after either availability outcome, and queue operations release after both empty/nonempty dequeue and full/nonfull enqueue outcomes. Invalid buffer-release indices bypass the mutex calls. Event destruction separately releases its associated message buffer; mutex release does not destroy or reclaim that buffer.

Canonical and rendered views agree completely, with no function-name substitutions or renderer errors. Existing function names correctly identify interface roles rather than promising effective locking. Sixteen existing facts are retained; one acquisition-state explanation is corrected to avoid an unsupported compiled-size assertion and distinguish this hook's lack of exclusion from runtime-wide synchronization guarantees. No compiled layout or instruction-size conclusion is made.

Evidence: [implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/mutex_TRK.c#L5-L18), [declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/mutex_TRK.h#L4-L10), [buffer callers](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msgbuf.c#L13-L78), [queue callers and event lifetime](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/nubevent.c#L15-L89).

Status: synthesized; independent review and live promotion pending.
