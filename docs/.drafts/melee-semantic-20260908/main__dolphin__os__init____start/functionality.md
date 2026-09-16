## Bootstrap behavior
The source implements PowerPC startup with existing names that fit their roles; no rename is warranted. `__init_registers` loads r1 from `_stack_addr`, r2 from `_SDA2_BASE_`, and r13 from `_SDA_BASE_`. `__start` then calls hardware initialization, installs two -1 stack words, initializes writable memory, and clears the word at 0x80000044.

`__init_data` walks the ROM-copy table to its first zero-size entry, copying and flushing only entries whose source and destination differ. It then walks the BSS table to its zero-size sentinel and clears each region. Neither table is bounded or validated here beyond those sentinels.

If the boot-information pointer at 0x800000F4 is nonzero, debugger flag 2 or 3 at offset 0xC invokes `InitMetroTRK`, with r5 respectively 0 or 1. No additional meaning for these numeric modes is established locally. Boot information is reloaded afterward. Its offset-8 argument-block offset is resolved relative to the boot-information base; a nonzero count drives in-place relocation of that many argument offsets. r14/r15 retain argc/argv across subsequent initialization calls. The argv address rounded down to 32 bytes is written to ArenaHi at 0x80000034. Missing boot information, zero argument-block offset, or zero count supplies `(0, NULL)` instead. This routine does not allocate argument storage or validate its bounds.

Argument processing precedes `DBInit` and `OSInit`. The controller check runs when the device-code high bit is clear, or when that bit is set and the remaining bits equal 1; other high-bit-set codes skip it. `__check_pad3` requests `OSResetSystem(OS_RESET_RESTART, 0, FALSE)` when all bits of mask 0x0EEF are present in the halfword at 0x800030E4; additional bits are permitted. The source does not establish whether the reset call returns. The normal continuation calls `__init_user`, passes the preserved arguments to `main`, and branches to `exit` with main's return value. The skip label is not evidence of BBA initialization.

## Evidence limits
The entire canonical and rendered file was reviewed. The renderer reports 157 parse errors and zero substitutions, marking assembly identities uncertain; canonical instructions, not rendered hypotheses, support this assessment. Source `.init` annotations establish declared placement intent only, not actual compiled layout. Historical precompilation, compiler selection, and final main.dol linkage remain unverified here.

## Lead reconciliation
Independent canonical inspection supports all three proposed corrections and both accepted deferrals. The ten unchanged research facts are explicitly retained, as are the existing names. No further factual or naming overrides are warranted.

Status: synthesized; independent review and live promotion pending.
