## OSAlloc.h

This header declares the Dolphin OS heap-allocation interface. `OSHeapHandle` is an alias for `int`, and `__OSCurrHeap` is declared as an external volatile heap handle ([lines 6–8](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSAlloc.h#L6-L8)).

The declarations cover explicit-heap allocation and freeing, fixed allocation, current-heap selection, allocator initialization, heap creation/destruction/extension, heap checking, referent-size queries, heap dumping, and allocated-block visitation. The visitor callback accepts a `void *` and an `unsigned long` ([lines 10–21](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSAlloc.h#L10-L21)). These are declarations only: they do not establish allocation algorithms, alignment, error or sentinel values, callback traversal rules, or heap/block lifetime guarantees.

`OSAlloc(size)` and `OSFree(ptr)` forward to `OSAllocFromHeap` and `OSFreeToHeap`, respectively, passing `__OSCurrHeap`. In particular, the free macro supplies the current heap rather than deriving a heap from the pointer; this header does not establish validation behavior when the pointer belongs to another heap ([lines 23–24](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSAlloc.h#L23-L24)).

All 27 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors; its unchanged names fit the interface, and its identity annotations are not evidence of additional implementation behavior. Subject and link enumeration returned no records. No factual correction or supported naming improvement is needed, and no knowledge changes are proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
