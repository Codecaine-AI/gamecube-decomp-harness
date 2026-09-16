# Object Pool Allocator

This TU manages fixed-size reusable objects through per-descriptor intrusive free lists. It owns one heap-region descriptor and a registry head. The six public implementations, private removeAll helper, three owned header types and six header inline accessors are covered below. Canonical and rendered source and header were read fully at revision c302741689bd67c361cd7faadb221df3193992c3.

## Allocation and Release

HSD_ObjSetHeap copies a byte capacity and base pointer into obj_heap. A nonzero base selects linear allocation inside that region; zero selects HSD_MemAlloc. HSD_ObjAllocAddFree computes size times count. In private-region mode it aligns the cursor, truncates to a whole-object count that fits, and updates cursor and remaining bytes. In general-heap mode it requests the full byte count without applying this TU's alignment-mask operation. It links consecutive objects through their first pointer-sized word and attaches the previous free head to the last entry. It returns the number added, or zero on the explicit allocation failures. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L13-L69.

HSD_ObjAlloc first enforces the enabled numeric limit. With heap limiting enabled, it samples private remaining bytes or OSCheckHeap(HSD_GetHeap()). At or below the threshold it sets the count cap to used plus free; above the threshold it restores the unlimited sentinel. It rejects allocation when used reaches that cap. An empty list triggers one-object replenishment. Success pops the head, increments used, decrements free, and raises peak if needed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L71-L117.

HSD_ObjFree overwrites the object's first pointer with the old free head and prepends the object. It increments free and decrements used. It does not release backing memory or validate nullness, pool ownership, duplicate release, or counter underflow. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L119-L126.

## Initialization and Registry

removeAll walks pointer-to-pointer registry links and unlinks occurrences of the descriptor. HSD_ObjAllocInit asserts data, removes its prior registration, clears the complete 0x2C descriptor, sets numeric and heap caps to all-bits-one, stores align minus one as the mask, rounds size using that mask, and prepends the record. The mask arithmetic expects a suitable nonzero power-of-two alignment but never validates it. Reinitialization forgets the old free list and counters; it does not reclaim old allocations. The null branch does not make NULL safe because memset follows it. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L128-L156 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L19-L33.

_HSD_ObjAllocForgetMemory ignores low and high, writing NULL only to alloc_datas. It neither traverses descriptors nor changes obj_heap, counters, limits, or free lists. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L158-L161.

## Owned Header

objheap declares top, curr, size, remain as four u32 fields in that order. HSD_ObjAllocLink contains next. HSD_ObjAllocData contains two limit flags, freehead, used/free/peak counters, caps and threshold, stride, alignment mask, and registry next; ASSERT_SIZE fixes its layout at 0x2C. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L8-L33.

HSD_ObjAllocGetUsing returns used, GetFreed returns free, and GetPeak returns peak. HSD_ObjAllocSetNumLimit assigns num_limit without enabling it. HSD_ObjAllocEnableNumLimit sets num_limit_flag to one; DisableNumLimit sets it to zero. All six inline helpers assert the descriptor first. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L35-L70. Header lines 72-77 declare the six exports with the signatures shown in naming.md.

## Section Evidence

Existing source and split ELF objects confirm .data holds obj_heap at offset zero and objalloc.c at offset 16. Its linked size is 32 bytes. The .sdata allocation holds the assertion string data and padding, totaling eight linked bytes. The .sbss allocation contains the four-byte alloc_datas pointer plus four padding bytes. compiled-evidence.json records hashes and byte layouts. The existing report matches the frozen manifest hash and records 48 matched data bytes; no matching or compilation command ran.

## Constraints and Unresolved Questions

Callers must provide usable strides and counts. The private-region path returns zero for a zero object count. The general-heap path does not guard num equal to zero before unsigned num minus one controls the linking loop. The review does not claim zero-sized requests are supported. The code does not validate arithmetic overflow, alignment, free-list integrity or concurrent access. These are observed preconditions and omissions, not proposed code changes.

Foreign memory, initialization, OS allocation and assertion behavior remain dependency boundaries. Caller snippets in initialize.c were checked only as context; no foreign type fact or cross-family rename is proposed. Render parser errors number two in C and four in H. All text was available, no names were substituted, and both pages reached EOF.

## TU Lead Verification

Lead independently reviewed all C162/H80 canonical and rendered lines. The source supports the count-limit and heap-limit order, intrusive free-list mutation, alignment-mask storage and registry-only forgetting. Header helpers and parse-error metadata are explicitly covered. See lead-verification.json. Final proposal SHA-256 remains `29eeee42cce14f9d19c4c5a988fe10b6afc32b2dd1f161a9623bedf48ff69fb0`; independent root gate is pending.

## Live Promotion Receipt

Root promoted 39 reviewed operations to the live KB. Source files are unchanged. See [completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__objalloc/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__objalloc/final-render.json). Proposal and review hashes are preserved.

## Current Application Status

Root completed reviewed live KB promotion for 39 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__objalloc/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__objalloc/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/29eeee42cce14f9d19c4c5a988fe10b6afc32b2dd1f161a9623bedf48ff69fb0/2026-09-08T14-38-47.293Z-711b7671-7634-4b33-b7ec-5ca7a09619ec.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__objalloc/final-render.json).
