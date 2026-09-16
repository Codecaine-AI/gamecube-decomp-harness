## GX FIFO semantic review

Reviewed all 617 canonical and rendered lines, all 32 subjects, 70 facts, and 26 links. Existing function names fit their implementations; no rename is warranted. Retained 68 facts and all 26 links explicitly in checkpoints; two facts require correction.

### Construction and attachment
`GXInitFifoBase` establishes base, top (`base + size - 4`), size, default watermarks, and coincident empty cursors. `GXInitFifoPtrs` computes the forward byte distance, adding one buffer size for a negative difference, under interrupt exclusion. Equal cursors produce zero rather than representing a full buffer. Preconditions are expressed through assertions. `GXInitFifoLimits` prohibits the currently GP-attached object, not a CPU-only attachment, and performs two ordinary stores without interrupt exclusion.

`GXSetCPUFifo` programs PI bounds and the masked write pointer. `GXSetGPFifo` disables reads and watermark interrupts, programs CP register pairs, synchronizes, selects linkage, acknowledges watermark conditions, and enables reads. Pointer identity—not equality of buffer contents—determines linked operation. These routines retain descriptor pointers; they do not copy ownership of backing storage. GX startup initializes and binds the same descriptor to both endpoints ([startup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXInit.c#L88-L97)).

### Interrupts and persistent state
The dispatcher snapshots status once and independently checks underflow, overflow, then breakpoint. Later checks consult the potentially modified enable shadow. Overflow increments accounting, selects low-water monitoring, acknowledges high water, marks suspension, and suspends the saved GX thread. Underflow resumes that thread, clears suspension, acknowledges both conditions, and restores high-water monitoring. Breakpoint handling clears interrupt-enable bit 5 and invokes an optional callback using a temporary OS context; it does not clear the retained breakpoint address or comparison-enable bit 1 ([handlers](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXFifo.c#L33-L97)).

`__GXFifoInit` registers vector 0x11, unmasks 0x4000, captures the current thread, clears suspension, and nulls both selections. It does not explicitly reset every persistent global. Thread replacement asserts that overflow suspension is inactive. Overflow getter/reset APIs expose the counter; reset is not interrupt-protected.

### Readback, cleanup, and redirection
Save/query paths reconstruct pointers and counts from PI/CP registers. Unlinked CPU occupancy instead uses cursor subtraction with wrap correction. GP-save asserts read-idle; read-disable itself contains no idle polling. Status queries use strict greater-than/less-than watermark comparisons. Breakpoint callback replacement reads the old callback before disabling interrupts.

Cleanup temporarily attaches a stack-local descriptor, resets the original descriptor, and restores original attachments before returning. This preserves the temporary descriptor's lifetime. `__GXInsaneWatermark` directly sets high water to low water plus 512 and updates hardware ([readback and cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXFifo.c#L243-L518)).

In the non-DEBUG write-gather implementation, redirection saves the CPU write cursor and temporarily disables the hardware link without clearing `CPGPLinked`; restoration uses that retained flag to restore watermark monitoring and linking. Restoration writes 31 zero bytes and drains the gather pipe before reinstalling PI state. The active source uses a 21-bit field at bit 5; commented alternative masks are not active behavior. DEBUG branches include separate nonmatching assembly bodies, so equivalence is not asserted ([redirection](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXFifo.c#L520-L616)).

### Evidence boundaries
Rendered views made zero substitutions and reported four parse errors. They cover function names only and are not independent proof of parameter names or data layout. Source declarations support logical persistent-state roles, but do not establish compiled `.sbss` membership, ordering, padding, or eight word-sized entries.

Status: synthesized; independent review and live promotion pending.
