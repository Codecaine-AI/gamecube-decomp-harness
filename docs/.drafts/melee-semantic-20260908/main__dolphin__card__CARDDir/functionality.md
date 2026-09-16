## CARDDir semantic review

This unit exposes the active in-memory memory-card directory and implements its asynchronous erase-then-write persistence. Existing canonical names fit their roles; the rendered view is identical, with no substitutions or parse errors. No rename is warranted.

- `__CARDGetDirBlock` asserts `currentDir` is present and returns it unchanged. It does not check attachment, select a copy, or perform I/O. Canonical consumers confirm indexed file opening and unused-directory-slot counting.
- `__CARDUpdateDir` asserts the channel range and returns `CARD_RESULT_NOCARD` when detached. Otherwise it increments `checkCode`, requests checksum computation over `0x2000 - sizeof(u32)` bytes, stores the full directory cache range, saves the callback, and returns the sector-erase starter's result directly. The address is the directory's work-area offset divided by `0x2000`, then multiplied by `sectorSize`.
- `EraseCallback` interprets nonnegative completion as permission to start a `0x2000`-byte write. Nonnegative write-start status leaves completion pending. Negative erase completion or immediate write-start failure follows its terminal tail.
- `WriteCallback` switches between work-area offsets `0x2000` and `0x4000` and copies the written image into the newly selected buffer only on nonnegative completion. Negative completion skips both mutations.
- Both callback tails call `__CARDPutControlBlock` only when `apiCallback` is null, then capture `eraseCallback` and clear it before invoking it if present. This preserves the distinction between local completion and higher-level API ownership.

The two state-machine explanations need correction: immediate starter returns are not equivalent to callback terminal paths. This unit has no local rollback or callback cleanup after the direct erase-start return. No assertion is made about lower-layer or caller cleanup, exact negative result values, check-code overflow, or compiled layout.

Status: synthesized; independent review and live promotion pending.
