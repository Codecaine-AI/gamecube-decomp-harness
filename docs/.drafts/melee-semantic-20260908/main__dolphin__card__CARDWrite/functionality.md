## CARDWrite semantic review

The owned canonical and rendered file were reviewed completely. Existing function names fit their behavior; the rendered view makes no substitutions and reports no parse errors. Its unrelated `callback` shadowed-binding annotation is not evidence of a cross-module relationship.

`CARDWriteAsync` seeks within an existing file, checks sector alignment and directory access, performs source-cache writeback, stores the callback and source buffer, and initiates erasure of the current physical sector. Buffer non-nullness, 32-byte alignment, and positive length are asserted preconditions; sector alignment also has an explicit runtime failure path. Seek failure returns immediately; subsequent validation and initial erase-start failures release the acquired control block.

`EraseCallback` starts a sector-sized write after nonnegative erase completion. Erase failure or write-start failure clears the saved API callback, releases control, asserts the callback is present, and invokes it. `WriteCallback` checks cancellation only after a nonnegative write result, before decrementing remaining length. Positive remaining length advances offset and follows the FAT, rejecting blocks below 5 or at least `cBlock`; completion updates the directory timestamp using `OSGetTime()/(__OSBusClock/4)` and hands off metadata persistence.

Cross-file state matters: `__CARDSeek` initializes the active file information; CARDRdwr's page completion advances `card->buffer` by 0x80 per successful page, so this file need not advance the source pointer between sectors. `CARDCancel` marks an active matching file's length as -1. Directory persistence transfers the API callback into the directory layer's `eraseCallback`, whose completion normally releases control and notifies the caller.

A material exceptional branch was missing from the existing detailed state explanation: `WriteCallback` clears `apiCallback` before calling `__CARDUpdateDir`, but its immediate-failure path reloads that cleared field before asserting and invoking it. The directory routine can return an immediate negative result without restoring the field. This is not a guaranteed normal error notification path; the proposed refinement preserves that distinction without claiming a particular compiled failure outcome.

`CARDWrite` forwards all arguments with `__CARDSyncCallback`, returns a negative startup result directly, and otherwise returns the channel synchronization result. The inspected synchronization implementation sleeps while the result equals -1.

Twenty-four baseline facts and all eight links are explicitly retained in checkpoints. One detailed state fact is refined. No renaming, identity changes, or compiled layout claims are proposed.

Status: synthesized; independent review and live promotion pending.
