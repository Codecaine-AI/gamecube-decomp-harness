## GXRestoreWriteGatherPipe

The canonical assembly supports the filename's restoration role. The rendered view contains no name substitutions, so there are no alternative naming hypotheses to validate. No baseline subjects, facts, or links were present; no knowledge changes are proposed.

### Behavior
- Checks `IsWGPipeRedirected` and calls `OSPanic` when it is zero. On the continuation path, clears that flag **before** disabling interrupts and saves the previous interrupt state. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRestoreWriteGatherPipe.s#L8-L20.
- Writes exactly 31 zero bytes to `0xCC008000`, calls `PPCSync`, and repeatedly calls `PPCMfwpar` until its low bit clears. There is no timeout in this loop. It then converts `0xCC008000` through `OSUncachedToPhysical` and passes the result to `PPCMtwpar`. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRestoreWriteGatherPipe.s#L21-L39.
- Restores register values through `__piReg` using existing `CPUFifo` state: fields at offsets `0` and `4`, with their upper two bits cleared, are written to register offsets `0xC` and `0x10`. The field at `0x18` undergoes a rotate-and-mask assertion check that calls `OSPanic` on a nonzero result. Its reloaded value is masked to clear the upper two bits, lower five bits, and numeric bit 26 before writing register offset `0x14`. This file establishes the operations, not the external field declarations or panic-message wording. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRestoreWriteGatherPipe.s#L40-L69.
- Only when `CPGPLinked` is nonzero does it call `__GXWriteFifoIntReset(1, 1)`, `__GXWriteFifoIntEnable(1, 0)`, and `__GXFifoLink(1)`. Both branch paths then execute `sync` and restore the saved interrupt state. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/GXRestoreWriteGatherPipe.s#L70-L89.

### Scope and limitations
The routine consumes externally maintained `CPUFifo` and `CPGPLinked` state without allocating, freeing, or replacing the FIFO object. The redirecting counterpart and helper bodies are outside this owned file. Panic calls are exceptional paths; this assembly alone does not establish whether `OSPanic` returns. All canonical and rendered lines were reviewed, but the renderer reports 112 parse errors and zero substitutions. No compiled section or layout conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
