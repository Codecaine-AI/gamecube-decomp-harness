# Effect-library shared storage

`efdata.c` is data-only: it defines `HSD_ObjAllocData efLib_AllocData`, `u32 efLib_LoadKind`, `u32 efLib_EffectCount`, and `s32 efLib_AnimCount`. Its header exports those objects and additionally declares `efAsync_AllocData`; that additional allocator is not defined by this translation unit. Both owned canonical and rendered files were read completely. The rendered view makes no substitutions and reports no parsing issues; it supplies no independent semantic proof.

## Allocator and lifetime

`efLib_Init` passes `&efLib_AllocData`, `sizeof(EF_Effect)`, and alignment argument `4U` to `HSD_ObjAllocInit`, then clears `efLib_EffectCount`. It does not explicitly reset the other two globals. The `EF_Effect` definition has a **source size annotation of 0x2C**, not inspected compiled-layout proof. The separate `ASSERT_SIZE` in `objalloc.h` concerns `HSD_ObjAllocData`, not `EF_Effect`, and cannot prove the allocation-size expression's compiled value.

Creation allocates effect records through this metadata. User-data cleanup decrements the accounting counter only for an effect with non-NULL `gobj` and `is_async == 0`, then returns the record to the allocator. A NULL `gobj` takes the duplicate-free assertion branch. These lifetimes are implemented in `eflib.c`, not in this storage-only unit.

## Mode and accounting

The source constants name mode 0 `EF_LOADKIND_ASYNC` and mode 1 `EF_LOADKIND_SYNC`. `efSync_Spawn` resets mode and animation count to zero. Early generator/async/alternate routes precede the assignment of synchronous mode for local recipes. Creation copies the mode into the `u8 is_async` field; its name must not be interpreted as proving that nonzero means the counted asynchronous population.

For mode 0, creation attempts removal when the counter is at least 64, then increments **before allocation**. Failed effect allocation returns without rollback. Failed GObj creation enters a branch whose nested non-NULL test fails after storing NULL, reaching the duplicate-free assertion rather than the apparent cleanup. Removal itself can assert if it cannot reduce the population. Consequently this is creation accounting, not an unconditional live-object count or proven hard-cap invariant.

## Pending animation

Animated models request frame zero, increment the signed animation count, and store their JObj at the previous index before checking whether the new count is at least 32. The synchronous, asynchronous-dispatch, and alternate-dispatch epilogues consume entries by predecrementing the count and animating that index while the count is nonzero. No negative-count guard or reentrancy protection is established by these inspected paths.

## Evidence and limits

Storage: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efdata.c#L1-L8 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efdata.h#L7-L12.

Allocator initialization: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L154-L187. Type distinction: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/types.h#L40-L74 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L19-L33.

Accounting/lifetime: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L337-L384 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L442-L529. Dispatch: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efsync.c#L65-L84. Drains: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efsync.c#L654-L659, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1122-L1127, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efalt.c#L534-L542.

Address and section comments are annotations. Exact compiled section placement, extent, ordering, historical register behavior, and compiled `EF_Effect` size remain unresolved. Existing names need no cosmetic changes.

Status: synthesized; independent review and live promotion pending.
