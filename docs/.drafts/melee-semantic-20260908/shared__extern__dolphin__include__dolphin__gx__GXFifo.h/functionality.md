## GXFifo.h semantic review

Read all 48 canonical and rendered lines and exhausted the empty subject and link inventories. There are no baseline facts or links to retain or correct, and no writable subjects. No proposals are warranted.

The header provides C-compatible GX FIFO declarations, with C++ linkage guards. `GXFifoObj` is represented in source by a `u8 pad[128]` member; the header does not expose internal FIFO fields. `GXBreakPtCallback` is a no-argument, void-returning function pointer. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXFifo.h#L1-L16)

The interface declares FIFO base, pointer and watermark initialization; CPU/GP FIFO selection and saving; and status, pointer, base, size and limit queries. The existing names fit these declaration-level roles. There are no implementations here establishing branch behavior, synchronization or buffer ownership. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXFifo.h#L18-L30)

Additional declarations cover breakpoint callbacks and enable/disable operations, GX thread access, current CPU/GP FIFO access, overflow counting, and write-gather redirection/restoration. Return types alone do not establish whether setters or reset operations return previous values, nor how redirected state is retained across calls. No compiled layout or section claims are made. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXFifo.h#L31-L41)

The rendered view contains no substitutions or parse errors and matches the canonical declarations. Its metadata associates the callback parameter `cb` with an unrelated DVD symbol; that binding is not evidence of semantic identity. The canonical declaration identifies `cb` only as a `GXBreakPtCallback` parameter. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXFifo.h#L31-L31)

Status: synthesized; independent review and live promotion pending.
