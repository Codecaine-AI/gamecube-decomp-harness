## CARDCheck semantic review

The unit implements GameCube CARD system-area verification and recoverable filesystem repair. All 350 canonical and rendered lines were reviewed, together with all 23 subjects, 39 facts, and 17 links. Existing function names fit their behavior; the rendered view contains no proposed-name substitutions or parse errors. Retained knowledge is recorded in the checkpoints; one unit-level state explanation is corrected below.

### Integrity primitives and redundant metadata

`__CARDCheckSum` accumulates two wrapping 16-bit sums: input words and individually complemented input words. It asserts an even byte length and independently maps final `0xFFFF` values to zero. `VerifyID` checks device ID, capacity, checksum pair, encoding, and the flash-ID-derived serial sequence. Encoding mismatch has a distinct result. Both paths after SRAM acquisition unlock without committing changes.

`VerifyDir` and `VerifyFAT` return invalid-copy counts, not CARD status codes. Their optional indices identify the selected destination slot when validation succeeds or the last failed slot otherwise. FAT validation additionally counts available data blocks. With no errors and no current pointer, each helper chooses slot 0 for a negative check-code difference, otherwise slot 1, then copies the opposite block over that slot. FAT explicitly casts both check-code operands to `s16`; this should not be described as an unqualified wrap-safe newest-copy comparison. Existing current pointers are preserved when both copies validate.

`__CARDVerify` propagates negative ID results and rejects every nonzero aggregate directory/FAT error count. Although it does not perform graph repair or writeback, its helpers can select and synchronize work-area copies.

### Extended check and completion

`CARDCheckExAsync` initializes the optional byte output before acquiring the control block. It rejects more than one aggregate metadata error and reconstructs one failed directory or FAT copy from its peer. The opposite FAT buffer becomes a zeroed reference map. Live directory chains must have valid, exclusively referenced blocks, the declared length, and exact `0xFFFF` termination. Unreferenced allocations are reclaimed, free space is recomputed, and changed FAT checksum fields are regenerated. On successful traversal the selected FAT is copied over the scratch buffer; early graph-error exits occur before that restoration and do not roll back preceding work-area changes.

Directory writeback has priority: `updateDir` returns through `__CARDUpdateDir`, even if orphan repair also changed the FAT in memory. Only otherwise do FAT-repair flags select `__CARDUpdateFatBlock`. The byte output is set to one system-block size before invoking an updater; it is not proof of successful media transfer. The unchanged path releases the control block and invokes the optional callback inline with interrupts disabled. Update-path completion and release are delegated outside this file.

`CARDCheckAsync` forwards channel and callback, supplies a stack-local byte output, and returns the extended result. That output pointer is not passed to either updater. `CARDCheck` supplies the synchronization callback, returns immediate failure directly, and otherwise waits through `__CARDSync`.

No compiled section, layout, or address conclusions are made.

Status: synthesized; independent review and live promotion pending.
