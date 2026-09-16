## OSReboot semantic review

This unit implements disc-backed console reboot. `__OSReboot` disables interrupts, stores `resetCode` at `0x817FFFFC`, clears `0x817FFFF8`, sets the reboot byte, publishes the saved-region pointers, and installs a cleared stack-local OS context. `bootDol` is unused. The source contains no mutation of the initially null saved-region pointers.

DVD initialization and automatic invalidation precede asynchronous reset preparation. `Callback` ignores both arguments and unconditionally sets the volatile `Prepared` latch. The latch has static zero initialization but is not cleared on entry to `__OSReboot`; it is not a per-call resettable readiness flag. A failed disc check calls the hot-reset routine. The caller then applies interrupt masks `0xFFFFFFE0` and `0x400` and enables interrupts.

`ReadApploader` waits for `Prepared`, issues an asynchronous absolute read at the supplied offset plus `0x2440`, then polls the command block. State 0 returns; state 1 and all otherwise unlisted values keep polling. States -1 and 2–11 call `__OSDoHotReset` and continue polling if that call returns. Neither wait has a timeout, and the asynchronous submission return value is not checked. Numeric state meanings beyond these branches are not established here.

The first read loads the 32-byte aligned `Header` object from disc offset `0x2440`. The second reads `OSRoundUp32B(Header.rebootSize)` bytes from `0x2440 + Header.size + 0x20` into `0x81300000`. `Header.size` itself is not modified. The code does not validate header fields or use `Header.entry`. After range instruction-cache invalidation, `Run` disables interrupts, calls `ICFlashInvalidate`, executes `sync` and `isync`, then transfers control through the link register. The following assembly cleanup is not the intended handoff path.

The stack-local context is installed as current, and stack-local DVD command blocks are passed to asynchronous operations whose states are polled before proceeding. No context restoration appears before the intended terminal handoff; external reset, callback, and context lifetimes are not independently established by this file.

Canonical and rendered lines 1–123 were reviewed. The rendered view reports 179 parse errors and zero substitutions, with function-only naming coverage. It therefore provides no independent validation of proposed data or parameter names. `Header` is a supported source identifier, but identifying it with the entire compiled `.bss` target requires compiled evidence. Likewise, source declarations do not prove `.sbss` ordering, extent, or padding.

Status: synthesized; independent review and live promotion pending.
