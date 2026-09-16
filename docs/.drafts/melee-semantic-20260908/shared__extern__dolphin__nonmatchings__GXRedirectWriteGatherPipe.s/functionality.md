## GXRedirectWriteGatherPipe assembly review

The filename's redirection description fits the canonical behavior. All 93 canonical and rendered lines were reviewed. The rendered view contains no name substitutions and reports 114 parse errors; it is not independent semantic evidence. Subject and link enumeration both returned empty baselines, so no knowledge edits or retention rows are warranted.

### Validation and sequencing
The routine saves its input and disables interrupts. It calls `OSPanic` when `__GXinBegin` is nonzero, the input is not 32-byte aligned, or `IsWGPipeRedirected` is already nonzero. These branches have no explicit local recovery or interrupt restoration before the panic calls. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRedirectWriteGatherPipe.s#L1-L35.

It sets `IsWGPipeRedirected` to 1, calls `GXFlush`, and repeatedly reads WPAR until its low bit clears, with no timeout visible. It passes `0xCC008000` through `OSUncachedToPhysical` to `PPCMtwpar`. Only when `CPGPLinked` is nonzero does it call `__GXFifoLink(0)` and `__GXWriteFifoIntEnable(0, 0)`. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRedirectWriteGatherPipe.s#L37-L55.

### Saved state and destination programming
The routine reads `__piReg + 0x14`, clears mask bit `0x04000000`, converts the result through `OSPhysicalToCached`, and saves it at `CPUFifo + 0x18`. It then writes zero to `__piReg + 0x0C` and `0x04000000` to `__piReg + 0x10`. A further input-bit validation (`rlwinm. r0, r29, 27, 7, 10`) can call `OSPanic` after these side effects; it must not be described as an entirely prevalidated, rollback-safe operation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRedirectWriteGatherPipe.s#L57-L75.

Finally it forms the register destination from masked input bits, explicitly clears `0x04000000`, writes `__piReg + 0x14`, executes `sync`, restores the saved interrupt state, and returns `0xCC008000`, rather than the supplied destination. The redirection flag and saved FIFO state remain beyond this return; no redirection teardown is present in this file. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRedirectWriteGatherPipe.s#L77-L92.

No compiled section placement, structure-layout identity beyond observed offsets, diagnostic-string contents, or external restoration behavior is asserted.

Status: synthesized; independent review and live promotion pending.
