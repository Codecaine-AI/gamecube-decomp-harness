# HSD Initialization

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical/rendered C366/H46 reviewed. UTC research 2026-09-08T15:16:38.576570+00:00 to 2026-09-08T15:21:06.112816+00:00.

## Entry Points

### HSD_InitComponent
Performs the ordered HSD base-component bootstrap needed before the game proceeds: it initializes OS-managed memory, establishes the initial video and framebuffer state, initializes GX, invokes the DVD setup hook, clears the default ID registry, waits for the first subsequent video retrace, initializes object allocators and diagnostic logging, and finally marks initialization complete.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L50-L77

### HSD_GXSetFifoObj
Registers the initialized GX FIFO object as HSD's default FIFO and charges the configured FIFO reservation to HSD's memory report before component initialization computes available system memory.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L79-L83

### HSD_DVDInit
Occupies the DVD-initialization stage of HSD component startup, between graphics initialization and identifier setup, while performing no runtime work in this build.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L85-L85

### HSD_AllocateXFB
Provisions the requested number of external framebuffers for a GX render mode, records their total memory cost, stores their addresses in the global FrameBuffer table, clears unused entries, and returns that table for video initialization.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L87-L119

### HSD_AllocateFifo
Obtains a requested-size block of memory to serve as the GX command FIFO's backing store during graphics startup, using the current OS heap when no arena is available and otherwise reserving the block from the low end of the OS arena.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L121-L143

### HSD_GXInit
Establishes a known baseline for HSD lighting at graphics startup by constructing one default GX light object, loading it into every GX hardware light slot, and invalidating HSD's cached graphics-state categories.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L145-L159

### HSD_OSInit
Bootstraps HSD's heap environment from the Dolphin OS arena: it initializes OS heap-descriptor management, reserves a fixed low-end heap for audio/synthesis use, creates and selects a main heap over the remaining aligned range, initializes HSD object-allocation accounting against that main heap, and removes the claimed range from the general OS arena.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L161-L187

### HSD_GetHeap
Returns the heap handle currently selected by the HSD baselib so general memory allocation, deallocation, and heap-aware object-allocation checks all operate against the same active Dolphin OS heap.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L189-L192

### HSD_SetHeap
Selects the OS heap handle that HSD's general allocation and deallocation wrappers treat as the active HSD heap, allowing higher-level heap management code to redirect an allocation or free to a particular HSD-compatible heap.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L194-L197

### HSD_GetNextArena
Returns the saved lower and upper bounds of the arena region used to create the HSD main heap, allowing callers to recover the currently configured main-heap memory range.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L199-L203

### HSD_CreateMainHeap
Rebuilds the process-global HSD main heap, first invalidating class and subsystem state that may retain references to the old arena, then recreating the Dolphin OS heap over saved or newly supplied bounds, selecting it as current, and resetting HSD object-allocation capacity for the replacement range.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L205-L236

### HSD_GetCurrentRenderPass
Exposes the active HSD render-pass mode so camera activation and other rendering code can select pass-specific graphics setup.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L238-L241

### HSD_StartRender
Establishes the active HSD render-pass context and reapplies the GX embedded-framebuffer pixel/depth format and display-field mode required by the current VI render mode before pass-specific camera setup and drawing.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L243-L253

### HSD_Init_803755A8
Acts as an end-of-render marker used after both screen and offscreen drawing, but its matched body currently has no runtime side effects. It only checks whether the active pass is offscreen and then evaluates and discards another comparison.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L255-L261

### HSD_ObjInit
Performs the common HSD object-allocation startup sequence by invoking the allocation-data initializers for list nodes, animation and function objects, ID entries, vectors, matrices, relation objects, rendering records, shadows, and depth-sorted display lists.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L263-L275

### HSD_ObjDumpStat
Prints one diagnostic line for each of thirteen allocator categories, reporting current in-use count, current available free-list count, and peak in-use count. The label freed is backed by HSD_ObjAllocData.free, which increases when entries are added or returned and decreases on allocation; it is not a cumulative number of releases.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L281-L308

### HSD_SetInitParameter
Provides the pre-start configuration interface for HSD platform initialization, allowing the caller to override resource-sizing and video-mode defaults before HSD_InitComponent consumes them.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L310-L365

## Allocation and Configuration Boundaries

XFB capacity is three. nbuffer is not range-checked, and heap results are not checked for null. Width rounding uses mask 0xFFF0, height multiplication is unsigned, and accounting excludes any alignment gaps. Null rm returns before changing report/table. FIFO uses a different heap fallback: both rounded bounds must be zero, not merely equal; size advances the cursor without rounding or overflow checks. Both allocation routines use __OSCurrHeap, while HSD_SetHeap affects only the separate HSD current_heap. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L79-L143; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L189-L197.

The parameter setter reads four scalar values as u32 and accepts any nonzero value, including values converted into signed int count storage. It does not cap XFB count or enforce FIFO/audio alignment. The rmode pointer is accepted even when null and still returns false. Unsupported selectors consume no vararg. After init_done every call returns false before varargs, and only the first emits a warning. XFB max count is not consumed in owned code; allocation receives an explicit count. FIFO accounting uses configured size independently of allocation size. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L31-L83; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L310-L365.

OS initialization aligns its initial limits then adds raw audio size before saving main-heap bounds. OSCreateHeap rounds actual limits internally, so arbitrary audio-size settings can leave saved/accounted bounds different from actual heap extents. Heap-creation results are not checked locally. CreateMainHeap calls class forgetting, then HSD_ObjInit, then six callbacks on OLD bounds, then applies optional bound overrides and destroys/creates/selects the OS heap. _HSD_ObjAllocForgetMemory clears the registry after initializers have registered descriptors. memReport.heap is not updated during recreation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L161-L236; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L128-L161; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSAlloc.c#L384-L430.

## Rendering, Types, and Names

GXInit passes (1,0,0) to the direction API, whose internal representation stores negated components. All eight indexed light slots are uploaded and represented state categories invalidated. StartRender trusts its pass input and stores it without validation; the camera consumer rejects unknown values later. Its mode comes from current VI state, distinct from the startup rmode pointer. The default pixel format remains zero and z format GX_ZC_MID in owned source. HSD_Init_803755A8 only evaluates comparisons. HSD_EndRender is retained as an inferred role based on screen/offscreen call placement, not promoted to canonical proof. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L145-L159; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L238-L261; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXLight.c#L218-L228.

Internal-linkage functions are DVDInit, GXInit, OSInit, ObjInit because their earlier declarations are static. All 17 canonical names retained and all 11 empty parameter subjects reviewed. Header HSD_MemReport contains five u32 counters plus explicit padding through 0x2C; HSD_InitParam selectors are 0-4. Defaults are 256 KiB FIFO, two XFBs, 512 KiB audio and four OS heaps. Required output pointer pairs in GetNextArena are unchecked; nullable bounds in CreateMainHeap preserve the old corresponding value. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.h#L10-L43; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L26-L48; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L199-L236.

Statistics emit thirteen lines and invoke each provider independently for each of three accessor arguments; their evaluation order is not specified by source. The free count is current inventory, not cumulative releases. The game debug handler uses D-pad Right trigger while X is held, with DebugRom-or-higher entry gating. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L281-L308; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L35-L51; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L98-L122; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L295-L300.

## Links and Coverage

All eight exact outgoing baseline records are retained with per-record pinned canonical evidence in link-dispositions.json: retrace barrier, XFB video initialization, GX light object and slot initialization, command FIFO backing, EFB format, field rendering, and developer diagnostics. No new links or link mutations proposed. No missing source/header function targets. One MUST_MATCH-only diagnostic string has no live owned use. All six section layouts remain unresolved without compiled evidence. No source/shared KB edits, runtime execution, Git, UI, or publication.
