## Audio DSP lifecycle

`OSAudioSystem.c` defines the private 128-byte `DSPInitCode` image and two blocking, argument-free hardware routines. Both canonical and rendered source were reviewed completely; the rendered view has no substitutions or parse errors. Existing function names accurately describe their roles.

### Initialization
`__OSInitAudioSystem` saves 128 bytes from `0x81000000` below the current ArenaHi, installs the bootstrap image there, and calls `DCFlushRange`. It checks DMA/control entry conditions through assertions, resets control state, and submits two identical transfer-register setups: `0x01000000`, zero, and `0x20`, separated by an elapsed-tick threshold of `0x892`. The 128-byte staging extent must not be confused with the transfer count. It subsequently clears control bits, waits for a mailbox response, and invokes an assertion unless the combined word equals `0x80544348`. It resets again and restores the saved work-buffer bytes on the normal path. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSAudioSystem.c#L6-L97)

The hardware polling loops have no timeout. The assertion requiring register 5 bit `0x004` should not be described simply as requiring an already-working DSP: the associated failure diagnostic says 'DSP already working'. Assertion failure is not a returned error, and restoration is not implemented as exceptional-path cleanup. The source's `errFlag = 0`, nonmatching comment, and discarded `reg16 != 42069` expression do not implement another recovery branch.

### Stop
`__OSStopAudioSystem` writes `0x804` to register 5, clears register 27 bit `0x8000`, waits for masks `0x400` and `0x200` to clear, writes `0x8AC`, clears register 0, and waits for the combined mailbox high bit to clear. After an elapsed-tick threshold of `0x2C`, it sets register 5 bit 0 and waits for it to clear. There is no timeout or alternative shutdown path. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSAudioSystem.c#L99-L128)

### Cross-file lifetime
`OSInit` establishes ArenaHi before invoking initialization inside its one-time startup guard. The initializer queries ArenaHi again when restoring rather than retaining the original backup address, does not reserve scratch space by moving ArenaHi, and does not explicitly flush the restored bytes. [Startup caller](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OS.c#L143-L187)

`OSResetSystem` invokes the stop routine immediately after disabling scheduling and before reset callbacks and conditional SRAM, reboot, or hardware-reset phases. These later phases are branch-dependent. [Reset caller](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSReset.c#L156-L202)

The source proves the bootstrap array's name, type, extent, and use, but does not prove that it exclusively occupies the compiled `.data` target.

Status: synthesized; independent review and live promotion pending.
