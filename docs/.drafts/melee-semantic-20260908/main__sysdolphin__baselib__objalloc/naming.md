# Naming Review

All six exported function names are canonical and retained. No inherited function-name hypotheses exist. The only inherited section alias, alloc_datas, matches the source declaration and compiled symbol and is retained. No new names are proposed.

| Subject | Canonical Meaning | Disposition |
|---|---|---|
| HSD_ObjAlloc#r3 | data: mutable allocator descriptor | No existing fact; canonical meaning retained |
| HSD_ObjAllocAddFree#r3 | data: allocator descriptor | No existing fact; canonical meaning retained |
| HSD_ObjAllocAddFree#r4 | num: requested object count | No existing fact; canonical meaning retained |
| HSD_ObjAllocInit#r3 | data: descriptor to initialize | No existing fact; canonical meaning retained |
| HSD_ObjAllocInit#r4 | size: requested object bytes before rounding | No existing fact; canonical meaning retained |
| HSD_ObjAllocInit#r5 | align: byte alignment converted to align - 1 mask | No existing fact; canonical meaning retained |
| HSD_ObjFree#r3 | data: allocator descriptor | No existing fact; canonical meaning retained |
| HSD_ObjFree#r4 | obj: object whose leading word becomes the free-list link | No existing fact; canonical meaning retained |
| HSD_ObjSetHeap#r3 | size: region capacity in bytes | No existing fact; canonical meaning retained |
| HSD_ObjSetHeap#r4 | ptr: private-region base or NULL for general heap | No existing fact; canonical meaning retained |
| _HSD_ObjAllocForgetMemory#r3 | low: ignored memory-bound pointer | No existing fact; canonical meaning retained |
| _HSD_ObjAllocForgetMemory#r4 | high: ignored memory-bound pointer | No existing fact; canonical meaning retained |

Owned header types retain objheap, HSD_ObjAllocLink, and HSD_ObjAllocData. Header getters return used, free, and peak; SetNumLimit only assigns the threshold, while EnableNumLimit and DisableNumLimit toggle its separate flag. removeAll is a private inline registry helper and has no current target. No foreign type is proposed.
