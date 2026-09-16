# HSD Video Presentation

Revision `c302741689bd67c361cd7faadb221df3193992c3`. This draft covers all of `video.c` and `video.h`, both canonical source and the frozen rendered view. Rendered names are hypotheses; both files have zero substitutions and zero parse errors. [Coverage](coverage.json) records immutable page artifacts, hashes and every baseline fact disposition. [Findings](findings.md), [naming](naming-table.md), [proposal](proposal.json), and [relationship decisions](link-dispositions.json) are separate review artifacts.

## Configuration and Initialization

`HSD_VIInfo` stores current configuration, three XFB records, EFB state, the active-buffer count, callbacks and performance state. An XFB carries its buffer pointer, ownership status and a saved configuration with a change flag. Initialization accepts up to three pointers, marks present slots FREE and absent slots NONE, configures VI and submits an initial full-screen copy into the first FREE buffer. It neither selects that buffer with VISetNextFrameBuffer nor marks it NEXT or DISPLAY. All-null buffers cause an unchecked index -1 access. The VI status pointer is also unchecked.

[Layout](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.h#L45-L94), [initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L393-L442).

`HSD_VISetConfigure` copies the entire render-mode object. `HSD_VISetBlack` updates the requested blanking value. Both set current.chg_flag without immediate VI calls. At copy submission, SetXFBWaitDone snapshots current into the buffer and clears the current flag. The pre-retrace callback later applies the saved mode and black value. Downstream VI black handling sets the active-video count to zero without changing framebuffer pixels.

[Setters](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L381-L391), [snapshot](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L277-L290), [blanking calculation](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/vi.c#L631-L677).

## Buffer Ownership and Completion

With at least two configured buffers, GetXFBDrawEnable returns the first DRAWING slot or promotes the first FREE slot to DRAWING. The wait helper sleeps for retrace and retries until one is available. Search scans all three slots, including absent ones when the requested status is NONE.

The async copy submits GX display-copy commands, changes DRAWING to WAITDONE, saves configuration, waits out any older draw-done request and arms a new request with the slot index. Internal GX completion clears the waiting flag and calls an optional user callback. It does not advance XFB status itself. External code must call HSD_VIDrawDoneXFB, normally through a registered callback; initialization leaves that callback NULL. DrawDoneXFB requires WAITDONE and advances the slot to NEXT, or DRAWDONE if NEXT is already occupied. Index bounds are not checked before status assertions.

[Acquisition](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L163-L200), [submission and queue completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L267-L320), [internal callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L142-L149).

The pre-retrace callback selects NEXT for VI and stages its changed configuration. The post-retrace callback frees the prior DISPLAY slot, promotes NEXT to DISPLAY and promotes a DRAWDONE slot to NEXT. In the single-buffer fallback, an externally prepared EFB DRAWDONE state makes pre-retrace reserve a DISPLAY or FREE slot as COPYEFB; post-retrace submits the copy, marks the slot DISPLAY and frees EFB bookkeeping. External production of that EFB state is not established by this TU.

[Retrace transitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L63-L140). The independently read [VI interrupt handler](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/vi.c#L161-L230) calls the pre hook before the register commit and post hook afterward.

## Copies and Synchronization

CopyEFB2XFBPtr programs filter, gamma, update and clear state. SCREEN uses full EFB geometry with xfbHeight/efbHeight scaling. TOPHALF and BOTTOMHALF use unit scale and efbHeight minus four lines. BOTTOMHALF writes after a padded-width byte offset and copies the residual four-line overlap into the scratch buffer. Each GXCopyDisp requests clearing. Unsupported passes, including OFFSCREEN, panic. Pointer validity, dimensions and destination capacity are unchecked.

[Copy geometry](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L202-L265), [constants](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.h#L9-L43).

Both flush APIs return immediately below two XFBs and otherwise wait for WAITDONE, DRAWDONE and NEXT to disappear. One sleeps through VIWaitForRetrace; the other busy-polls. Neither has a timeout, and neither waits on DISPLAY, DRAWING or COPYEFB alone. Progress depends on working interrupts and callbacks. LastDrawDone searches WAITDONE before DRAWDONE, NEXT and DISPLAY, so its result does not certify completed GPU work.

[Flush and lookup](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L322-L379), [sleep implementation](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/vi.c#L464-L475).

## Callbacks and Storage

The callback setters return the old pointer, but read it before disabling interrupts. Only the replacement store is protected; describing the complete operation as an atomic exchange is too strong. Pre/post user hooks run after the local transition work. The pre-retrace performance window counts renewal decisions, publishing every frame_period callbacks. Initialization chooses 60 for VI_NTSC and 50 otherwise, resets the published count, and leaves the private static counters unchanged.

[Callback setters](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L25-L61), [counter update](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L99-L110).

Existing object observations show the 5120-byte scratch array at BSS offset zero, followed by 500-byte HSD_VIData. The two counters occupy .sbss. The eight-byte .sdata is the filename string `video.c`, not counters. The split/source .data sizes are 136/135 bytes and BSS sizes 5624/5620. The .sdata2 contains unit-scale and conversion constants. [Object evidence](object-evidence.json) includes hashes, bytes and symbol positions; no build or equivalence claim is made.

## Header and Inventory Boundaries

The owned header defines the state enums, render passes, layouts, callback types and unchecked inline accessors. GetNbXFB, GetXFBPtr, GetVIStatus and GetRenderMode directly return stored state or its address. Current source helpers absent from the indexed target list were still read: WaitXFBDrawEnable, CopyEFB2XFBHiResoAA, VIGXSetDrawDone, VISetXFBWaitDone and VIWaitXFBFlush_sub. The header declares HSD_VIGXDrawDone without defining it in this source. No new identity or alias is inferred from that declaration.

[Header API and accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.h#L98-L144). Cross-file dependencies and the remaining caller-specific fact are recorded in [unresolved](unresolved.md).
