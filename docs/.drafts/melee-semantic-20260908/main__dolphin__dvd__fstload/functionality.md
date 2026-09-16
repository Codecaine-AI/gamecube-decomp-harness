## DVD bootstrap FST loader

`__fstLoad` synchronously waits around a callback-driven DVD read chain. `DVDInit` invokes it in the explicitly identified JTAG boot branch (`dvd.c:81-109`). It aligns an automatic 63-byte disc-ID buffer and static 64-byte boot-block buffer to 32-byte boundaries, resets the drive, and submits a disc-ID request using a function-local static command block.

`cb` advances only on positive results: phase 0 sets phase 1 and requests 0x20 bytes at disc offset 0x420; phase 1 sets phase 2 and reads into `FSTAddress` from `FSTPosition`, using `(FSTLength + 0x1F) & 0xFFFFFFE0`. Positive completions in other phases schedule nothing. Result -1 returns without changing state; -4 resets phase to zero, resets the drive, and restarts disc identification. Other non-positive results are ignored.

The loader polls until `DVDGetDriveStatus()` returns numeric zero. Every arm of its drive-state switch is a no-op; even the fatal-error arm does not exit the loop. It subsequently publishes `FSTLocation` and `FSTMaxLength`, copies the 0x20-byte disc ID into cached physical-zero OSBootInfo, prints identity and streaming diagnostics, and sets arena high to `FSTAddress`. The earlier arena-high value is read but never used or restored.

The command block and boot-block storage persist, but `idTmp` points into the active loader's automatic buffer and becomes stale after return. The source does not explicitly reset `status` on loader entry, check asynchronous submission results, verify phase 2 before publication, or validate boot-block fields. Thus the intended bootstrap use should not be generalized into a reentrant or independently success-validated interface.

All 99 canonical and rendered lines were reviewed. The rendered view has zero substitutions and zero parse errors; function names remain canonical. Existing behavioral explanations substantially fit the source. Compiled section allocation and string pooling remain unverified rather than inferred from literal lengths or static declarations.

Status: synthesized; independent review and live promotion pending.
