## CARD chunked transfer layer

`__CARDRead` and `__CARDWrite` initialize channel-local transfer state and launch asynchronous operations in 512-byte read segments or 128-byte write pages. Both assert a positive transfer-unit-multiple length and channel 0 or 1, reject an unattached card, and store the callback, remaining-unit count, address and buffer before returning the first launch's immediate status. The write parameter named `dst` supplies outgoing payload bytes.

Each completion callback advances `xferred`, address and buffer only for a nonnegative completion, decrements `repeat`, and submits another unit if needed. An accepted continuation returns without terminal handling; a failed continuation falls through with its failure result. Negative incoming completions do not advance progress. Terminal handling calls `__CARDPutControlBlock` only when `apiCallback` is absent, then clears a nonnull `xferCallback` before invoking it. These helpers do not themselves acquire control-block ownership, reset `xferred`, or roll back installed transfer state on an immediate first-launch failure. Higher-level callers remain responsible for the surrounding lifetime and startup-failure handling.

`CARDGetXferredBytes` asserts the channel range and returns the current accumulator without attachment or activity checks. This unit does not establish when that accumulator is reset. BIOS launchers translate their queued/busy case into `CARD_RESULT_READY`, so successful startup is not proof of completed I/O.

The existing function names fit canonical behavior. The rendered view has no substitutions or parse errors and supplies no independent semantic evidence. One existing purpose statement overstates the admission condition as a mounted channel: `__CARDRead` checks attachment and is itself used during mounting before final verification. All other baseline facts and all links remain supported. No compiled placement or layout conclusions are made.

Status: synthesized; independent review and live promotion pending.
