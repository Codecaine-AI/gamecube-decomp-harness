## GXMisc semantic review

The complete 489-line canonical file and its rendered view were reviewed, together with all 40 subjects, 88 facts and 22 links. Rendered function names are unchanged, with no substitutions or parse errors. Existing canonical names fit their implementations; no renaming is warranted.

### Control and synchronization
- `GXSetMisc` selects XF-flush bookkeeping or display-list context saving. XF count storage narrows to `unsigned short`; subsequent zero tests use that stored count. A nonzero stored count adds dirty bit 8, while zero does not clear a previously set bit. The null token does nothing and invalid tokens only report under DEBUG.
- `GXFlush` commits dirty state, emits eight zero words and synchronizes the processor. Write-gather reset polls its status before resetting the address. Frame abort asserts and clears PI register 6 with separate timed waits before cleaning the graphics FIFO.
- Draw tokens and draw completion are distinct mechanisms. Token submission emits two token commands. Finish submission emits `0x45000002`, flushes, then clears `DrawDone` with interrupts disabled. Waiting sleeps in a predicate loop rather than polling the GPU.
- The token handler invokes its optional callback under a temporary OS context before acknowledgement. The finish handler acknowledges first, sets `DrawDone = 1`, optionally invokes its callback under a temporary context, then wakes the queue. Callback registrations persist until replaced; setters snapshot the old callback before disabling interrupts for the replacement.
- `__GXPEInit` installs vectors 0x12/0x13, initializes the queue, unmasks 0x2000/0x1000 and sets PE register 5's low four fields. It does not explicitly reset callback slots or `DrawDone`.
- HSD video preserves the selected XFB index across asynchronous completion, serializes an earlier fence before arming another, and clears its waiting state before forwarding the saved argument. This lifetime was checked in `video.c`.

### Pixel Engine and utility operations
- `GXPixModeSync` emits cached `peCtrl` and assigns `bpSent = 0`; texture synchronization emits `0x63000000` and assigns 1. These numeric assignments should not be normalized into a generic Boolean interpretation. HSD brackets conditional TEV color uploads with pixel-mode synchronization.
- Direct poke setters access PE registers rather than the ordinary GX shadow/FIFO state. Alpha mode, alpha read, destination alpha and depth mode construct replacement values; blend, update masks and dithering use read-modify-write. PE access is through `u16*`, despite `u32` temporaries. Consequently, the blend temporary's 0x41 high byte is discarded by the final halfword store.
- `CHECK_GXBEGIN` is an assertion. Field insertion asserts that inputs fit but does not mask invalid input values before shifting; preservation descriptions assume valid argument domains.
- EFB color/depth access builds an uncached address from 0x08000000, inserting ten-bit coordinate fields and selecting color or depth access.
- Depth conversion supports linear, near, mid and far formats, with capped compression exponents and special terminal shifts. Invalid format selectors call `OSPanic`. FAR decompression extracts a four-bit exponent without rejecting values 13–15, which lead to negative shift counts in the source; no portable result or compiled behavior is inferred for those inputs.

### Disposition summary
The checkpoint explicitly records 80 retained facts, six supported corrections and two unresolved facts, plus 20 retained links and two unresolved links. Source-level synchronization knowledge remains useful, but compiled `.sbss` membership/layout is not established by declarations. The attributed Flipper-workaround report remains unverified rather than being promoted to canonical fact.

Status: synthesized; independent review and live promotion pending.
