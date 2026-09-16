# List Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical/rendered C1-92 and H1-28 reviewed to EOF. Research started 2026-09-08T14:48:17.529Z; completed 2026-09-08T14:50:41.225506+00:00.

## HSD_ListInitAllocData

Configures SList then DList allocator descriptors for the corresponding node sizes and four-byte alignment. The delegated initializer removes prior registry entries, resets descriptor fields and prepends each descriptor, leaving DList immediately before SList.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L12-L16.

## HSD_SListGetAllocData

Returns the shared SList descriptor address without checking initialization.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L18-L21.

## HSD_DListGetAllocData

Returns the shared DList descriptor address without checking initialization.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L23-L26.

## HSD_SListAlloc

Allocates through the SList descriptor, asserts non-NULL and zeros the full node.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L28-L37.

## HSD_SListAllocAndAppend

Allocates one node, stores the opaque data pointer and inserts immediately after the nullable anchor. Returns the anchor or new singleton; no tail traversal.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L39-L47.

## HSD_SListAllocAndPrepend

Allocates one node, stores data and returns it as the new head before the supplied list.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L49-L57.

## HSD_SListAppendList

Inserts one required node after a nullable anchor, replacing the inserted node old successor. This does not concatenate two chains.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L59-L71.

## HSD_SListPrependList

Overwrites the required new node successor with the old list and returns the new node.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L73-L78.

## HSD_SListRemove

Saves the supplied node successor, returns that node to its allocator and returns the saved successor. NULL is accepted. Caller links and data payload are not freed or rewritten.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L80-L91.

## Owned Types and Storage

The header defines SList as next/data pointers and DList as next/prev/data pointers. This TU implements singly linked operations and supplies both allocators; it has no DList insertion/removal bodies. Observed .bss is 0x58 bytes with two 0x2C descriptors, matching the independently read allocator type size assertion. Observed .sdata contains list.c, list, next and prev diagnostic strings. Object hashes and full dumps accompany the packet without a rebuild.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.h#L6-L25, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L9-L16, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L19-L33, plus object-evidence files.

## Initialization and Reuse

HSD_ObjInit invokes the list initializer, and HSD_ObjDumpStat queries both descriptor getters under slist/dlist labels. Allocations pop a free node and update used/free/peak; release prepends the node to the allocator free list and updates used/free. Reinitialization clears descriptor state without freeing payloads or traversing live lists. Getters themselves have no initialization guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L263-L308 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L71-L156.

## Topology and Ownership Limits

Append is insertion after the supplied anchor, not append-to-tail. Both insertion helpers replace the inserted node old next field and perform no alias or membership check. Passing the same node as anchor and inserted node creates a self-link. Remove frees only the supplied node through the object allocator; callers must update their stored head or predecessor and manage the opaque payload separately. These are source semantics, not requested fixes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L59-L91 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L119-L126.

## Assertions

Allocation asserts a non-NULL result; insertion asserts its required inserted node. The macro uses explicit legacy lines under MUST_MATCH and current __LINE__ otherwise. Assertion diagnostics call __assert and the panic path. All owned facts and subjects, including nine empty parameter entities, have explicit decisions in coverage.json.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L16-L33 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L39-L53.

## TU Lead Verification

Complete canonical and rendered C/header reviewed, all 18 proposed slots scanned. Confirmed append inserts one node after anchor, not at tail; both insertion routines overwrite prior successor links; aliasing may produce self-link. Remove returns saved successor without fixing caller-owned links or freeing payload. Getter does not initialize allocator. Clear prose BSS name while preserving canonical allocator objects. Foreign initialization/allocator and diagnostic semantics remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/23cc2b039e68a4400bbe1bc7c278ec19c199fb10929da5cc70a8b96c11d79ff0/2026-09-08T14-57-40.054Z-c9864c69-c616-4127-a090-8135a8736960.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__list/final-render.json).
