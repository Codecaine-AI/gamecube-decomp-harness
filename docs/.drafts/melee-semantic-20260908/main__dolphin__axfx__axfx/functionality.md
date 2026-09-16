## AXFX allocation-hook interface

The complete canonical and rendered file was reviewed (23 lines). Rendered function names are unchanged, accurately describe the behavior, and require no renaming. All seven subjects, 16 facts, and three links were reviewed. Fifteen facts and all links are retained; one inferred-type fact is narrowed to avoid an unsupported compiled-section claim.

`__AXFXAlloc` and `__AXFXFree` initially select `AXFXAllocFunction` and `AXFXFreeFunction`. These wrappers forward the requested size or pointer unchanged to Dolphin OS allocation routines using `__OSCurrHeap` at the time of each call. Allocation returns the delegated result unchanged. The allocator adds and aligns header overhead, consumes or splits a suitable free cell, and returns NULL when none fits; invalid requests also encounter source assertion macros, so NULL is not a general invalid-input guarantee. Freeing requires a compatible allocation belonging to the currently selected heap; the wrapper does not recover the heap originally used for allocation.

`AXFXSetHooks` performs two sequential global assignments, allocator first, releaser second. It neither invokes callbacks nor validates them, restores defaults for null arguments, synchronizes the pair, or migrates outstanding allocations. The persistent configuration is not an atomic pair-update guarantee.

The chorus consumer independently confirms cross-file lifetime behavior: initialization requests `0x1680` bytes through the active allocator and retains the result; allocation failure restores interrupts and returns 0. Shutdown passes the retained pointer to the release hook active at shutdown, without a local null guard. Thus allocator/releaser compatibility must survive configuration changes while allocations remain outstanding. Default wrappers likewise require the appropriate current heap at release time.

Source declaration order and exact callback types are established. Compiled `.sdata` placement, binary ordering, and section extent are not established by the supplied evidence.

Status: synthesized; independent review and live promotion pending.
