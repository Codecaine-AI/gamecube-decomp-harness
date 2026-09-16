# HSD Heap Wrappers

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical/rendered C1-27 and H1-10 reviewed to EOF. Research started 2026-09-08T14:52:30.522Z; completed 2026-09-08T14:54:01.591222+00:00.

## HSD_MemAlloc

For signed size <= 0, returns NULL before reading the current heap. For positive size, calls OSAllocFromHeap with HSD_GetHeap and the requested byte count, asserts the returned address, and returns it. No local zero-fill, additional alignment adjustment or persistent state exists. The OS allocator handles its own header/alignment logic and may return NULL, which this wrapper turns into an assertion path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/memory.c#L14-L26 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSAlloc.c#L148-L180.

## HSD_Free

Unconditionally forwards ptr and the heap selected at call time to OSFreeToHeap. It adds no NULL no-op, original-heap recovery, pointer clearing or lock. The delegated free expects a correctly aligned allocation from that heap; its source validates arena bounds and ownership before removing the allocation cell and reinserting it into the free list. HSD_SetHeap can change the selected heap between allocation and release, so callers must maintain the correct heap context.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/memory.c#L9-L12, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L189-L197 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSAlloc.c#L322-L342.

## Diagnostic Sections

Observed .data contains memory.c; observed .sdata contains adr. Source-object sizes are 9 and 4 bytes, while target-object contributions include trailing padding. The latter string is the checked allocation variable's assertion expression. The explicit legacy line 52 is selected under MUST_MATCH; other builds use __LINE__. Neither section contains mutable heap state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/memory.c#L22-L25 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L16-L33, supplemented by both hashed object-evidence files. Debug source was independently read during the immediately preceding list review at the same revision and reused here.

## Coverage

All seven owned subjects are reviewed, including the previously fact-free .sdata target and both empty parameter entities. Existing names are canonical and need no aliases. Every baseline fact has its ID, timestamp/value-hash version, disposition and evidence in coverage.json. Shared heap types and runtime validation remain outside this TU proposal. No builds, matching, source edits or shared-KB writes occurred.

## TU Lead Verification

Complete canonical and rendered C/header reviewed, all eight proposed slots scanned. Nonpositive size returns before heap query; positive-size NULL allocation asserts. Free always uses current heap and forwards NULL without a local guard. No zero-fill or local ownership recovery. Foreign OS allocator and compiled diagnostics remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/948ae729e918a5ae4fb180ed5907810f5de62924c0c33e16b54694c8e4f42f52/2026-09-08T14-57-18.953Z-4ca7f1cc-38c6-4c71-a6ca-3d9bc5e613c7.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__memory/final-render.json).
