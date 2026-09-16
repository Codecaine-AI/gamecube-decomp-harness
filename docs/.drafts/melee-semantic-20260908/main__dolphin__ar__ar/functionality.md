## ARAM driver review

Canonical and rendered source were read completely. All 22 subjects, 53 facts and 11 links were reviewed. Existing function names fit their implementations; the renderer made no substitutions and reported no parse errors. Retained knowledge and exceptions are recorded in checkpoints: 47 facts retained, five unresolved, one superseded; all 11 links retained for their semantic roles rather than as proof of compiled placement.

### Initialization and allocation
`ARInit` returns 0x4000 immediately when `__AR_init_flag == 1`. Otherwise, with interrupts disabled, it clears the callback, installs interrupt handler 6, unmasks 0x02000000, initializes the allocation cursor at 0x4000, retains the caller's length-table pointer and capacity, computes refresh, probes capacity, and sets the initialization flag. The caller-owned table must remain valid while allocation/free operations use it. `ARReset` only clears the flag: it neither releases that table nor clears the callback, size or allocator state. `ARCheckInit` returns the flag, `ARGetBaseAddress` returns 0x4000, and `ARSetSize` does nothing except an optional debug report.

`ARAlloc` records lengths and advances a byte-address cursor; `ARFree` pops the latest length and optionally reports it. Free has no underflow guard. Allocation alignment/capacity checks are source assertions, not independently verified compiled rejection paths. Zero length passes the alignment expression and still consumes a record. Melee's arena initialization temporarily allocates 32 bytes, immediately frees that allocation, and uses the observed address as its lower boundary; its upper boundary is capped at 16 MiB.

### DMA and completion
`ARStartDMA` encodes main-memory address, ARAM address, direction and length into DSP registers 16–21 under interrupt masking, then returns without polling. Assertions cover busy state, main-memory alignment and length alignment; there is no corresponding ARAM-address assertion in this routine. `ARGetDMAStatus` returns the raw 0x200 mask, not a normalized boolean. Private read/write helpers select opposite direction bits and busy-wait without a timeout.

Callback registration snapshots the previous pointer before disabling interrupts; the replacement write itself is protected. `__ARHandler` applies `(value & ~0x88) | 0x20` to DSP register 5, dispatches a non-null callback without arguments under a cleared temporary OS context, clears that context again and restores the incoming context. The exception argument is unused. ARQ installs its service routine in this slot, retains pending requests across asynchronous transfers, selects direction-dependent operands and continues low-priority chunks. DevCom supplies direct, zero-fill and relay-buffered transfers through ARQ.

### Capacity detection
`__ARChecksize` aligns three stack buffers to 32 bytes, flushes marker data, waits on DSP register 11 bit 0 and performs synchronous DMA alias probes. Readback buffers are invalidated after DMA; comparisons examine the first word. Internal capacities 2/4/8/16/32 MiB map to mode values 0/1/2/3/4. Expansion probing begins at the detected internal boundary and adds 2/4/8/16/32 MiB; the corresponding additional mode bits are 0/8/0x10/0x18/0x20. These numeric encodings are preserved without inferring undocumented hardware meanings.

Missing internal ARAM reaches an assertion, not an explicit return. If assertion handling permits continuation, the initially zero size/mode feed the subsequent code. Failed expansion readback skips expansion accumulation and the final expansion-mode write. Probe writes are destructive and are not restored. Completion publishes total bytes both through the uncached physical-0xD0 word and `__AR_Size`; `ARGetSize` simply returns that stored value.

### Evidence limits
The source proves static declarations and refresh arithmetic, but does not prove contiguous `.sbss` order, `.sdata2` contents/extent, literal placement or a compiler conversion-bias constant. Those compiled claims remain unresolved rather than being inferred from rendered names or source conventions.

Status: synthesized; independent review and live promotion pending.
