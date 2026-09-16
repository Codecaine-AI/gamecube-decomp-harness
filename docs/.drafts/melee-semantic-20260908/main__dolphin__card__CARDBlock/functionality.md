## CARDBlock semantic review

Inherited research covers the complete canonical and rendered 169-line file, all 21 subjects, 34 facts and 10 links. The lead independently checked the canonical source for every proposed fact and upstream supersession and reconciled the proposal with this document. Existing function names, the 31 unchanged facts and all 10 links are retained. The rendered view makes no substitutions and is not independent behavioral evidence.

The unit manages GameCube memory-card FAT chains and asynchronous metadata persistence. `__CARDGetFatBlock` asserts and returns `currentFat`. Allocation checks attachment and free capacity, reserves the free count, circularly scans from the allocation cursor, builds a chain terminated by `0xFFFF`, records its start and initiates persistence. Its corruption return does not roll back earlier RAM mutations. Freeing follows links while clearing entries and increasing the free count; validation is incremental, and even an initially empty chain reaches the updater.

The updater increments the 16-bit FAT update field, recomputes checksums, stores the 0x2000-byte cache range, saves the completion callback and returns the immediate erase-start result. Nonnegative erase completion starts writing the current FAT. Nonnegative write completion switches between the RAM images at work-area offsets 0x6000 and 0x8000 and copies the written image into the alternate buffer. Error callbacks do not undo preceding FAT mutations. Terminal callback paths release the control block only when `apiCallback` is absent and clear a non-null saved callback before invoking it.

Initial erase-start failure is distinct from callback-delivered failure: the updater itself performs no cleanup on that direct return. The erase continuation re-fetches `currentFat`, so the selected image and operation state must remain consistent across the asynchronous lifetime. Inherited contextual research identifies a CARDCheck caller passing `card->currentFat` after metadata repair. No universal recovery, atomic rollback or compiled-layout claim is made.

Status: synthesized; independent review and live promotion pending.
