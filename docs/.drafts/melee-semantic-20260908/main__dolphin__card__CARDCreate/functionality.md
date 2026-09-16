## CARDCreate

Implements asynchronous memory-card file creation and its synchronous wrapper. Existing function names fit canonical behavior; the rendered view contains no proposed substitutions.

`CARDCreateAsync` rejects overlong filenames before acquiring channel control, then checks that the unsigned byte size is nonzero and sector-aligned. **The invalid-size branch returns `CARD_RESULT_FATAL_ERROR` directly after acquisition, without calling `__CARDPutControlBlock`.** Duplicate-file, directory-full, insufficient-space and immediate allocation errors instead use that release helper. Duplicate detection compares game and company ownership plus filename; the first entry with `gameName[0] == 0xff` is selected as free. Filename copying is bounded by `CARD_FILENAME_MAX`, without an additional explicit terminator write.

Before calling `__CARDAllocBlock`, it stages the callback (substituting the default for null), directory index, sector length, filename and caller-owned `CARDFileInfo` pointer. The handle's channel and file number are initialized before allocation; its offset and initial block are initialized later by the continuation. Consequently, initial acceptance is not completed creation, and the handle must remain valid for the deferred writes.

`CreateCallbackFat` saves and clears `apiCallback` unconditionally. A nonnegative incoming result initializes ownership, start block, timestamp and metadata defaults, then passes the saved callback to `__CARDUpdateDir`. Permission is assigned the literal `4`; no stronger permission interpretation is inferred here. Icon/comment addresses receive `-1`, display fields are cleared, and icon zero receives `CARD_STAT_SPEED_FAST`. A negative allocation result or immediate directory-update error releases control and invokes the saved callback if present. An accepted directory update returns without local release or direct notification, handing completion onward; this file alone does not establish downstream persistence or rollback details.

`CARDCreate` supplies `__CARDSyncCallback`, propagates a negative startup result immediately, and otherwise calls `__CARDSync`. These conclusions follow from canonical lines 13–132. No compiled section or layout conclusions are made.

Status: synthesized; independent review and live promotion pending.
