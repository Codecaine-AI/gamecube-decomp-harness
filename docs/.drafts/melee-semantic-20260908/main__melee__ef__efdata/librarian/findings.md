# Efdata semantic review

Pinned `c302741689bd67c361cd7faadb221df3193992c3`. All24 manifest lines read canonically and in the separate rendered view: C1–9/H1–15. Both renders statusok, zero parser errors/substitutions and exhausted. Two data targets, three writable subjects, eight baseline facts, no functions/parameters/empty subjects/outgoing links.

## Authored storage

Data-only translation unit defining HSD_ObjAllocData efLib_AllocData, u32 efLib_LoadKind, u32 efLib_EffectCount, and s32 efLib_AnimCount. The foreign allocator type asserts size0x2C. Source comments annotate scalar addresses0x804D64E8/EC/F0, but compiled section placement/extent is not independently verified. The header also declares efAsync_AllocData, which is defined in efasync.c, not here.

Provides shared mutable effect allocator metadata and global creation-mode, accounting-counter and queued-animation-count storage. EffectCount tracks mode0 creation accounting, not an infallible live-object count: Create increments before allocation and does not roll back effect-allocation failure. Mode0 is named EF_LOADKIND_ASYNC; mode1 EF_LOADKIND_SYNC.

efLib_Init configures the EF_Effect allocator with size0x2C/alignment4 and resets EffectCount, but does not explicitly reset LoadKind or AnimCount. efSync_Spawn resets both to0; early routes preserve mode0, local recipes set mode1. Create under mode0 attempts eviction at count>=64 and increments before allocation; is_async stores narrowed mode. Its failure paths can leave accounting overstated. Destructor decrements only when gobj is non-NULL and is_async==0. Animated models append a JObj and increment AnimCount before checking >=32. efsync and efasync dispatch epilogues predecrement the signed count and animate that index until it equals0; no negative-count guard or reentrancy protection is established.

C1 includes its public header. C3 defines allocator metadata. C5 explicitly questions .sbss ordering; C6–8 define AnimCount, EffectCount, LoadKind in reverse order to their annotated addresses. These annotations do not replace compiled placement evidence. H1–15 provides guards, integer/allocator type dependencies and extern declarations. efAsync_AllocData is only re-exported here; its definition is in efasync.c21. Static storage is zero-initialized by C semantics; runtime reinitialization is delegated to consumers.

## Review decisions

Six baseline section facts remain unresolved because section layout/address/instruction claims are not independently supported by pinned compiled evidence. In addition, the live-count and unconditional64-cap claims omit failure paths. Two file facts are corrected, and one file data-flow fact adds the complete reviewed storage/consumer contract. All original fact records and evidence are preserved. Canonical identifiers are retained; no section is renamed after an individual global.

The .bss allocator metadata type and EF_Effect both happen to be0x2C bytes; they are distinct objects/types. HSD_ObjAllocData contains limits, freelist head, usage/free/peak counters, allocation size/alignment and next allocator, not effect instance fields.

Exact outgoing-link inventory is zero, confirmed directly against the frozen baseline because no per-TU link file exists. No relationships inferred or invented.

## Evidence

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efdata.c#L1-L8
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efdata.h#L1-L14
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efsync.c#L55-L94
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efsync.c#L648-L663
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L17-L23
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1116-L1136
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L1-L33
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/types.h#L40-L74
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L154-L187
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L337-L351
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L439-L493
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L510-L529

Only draft/mirrored review artifacts and dry-run validation outputs are written. No source, shared KB, Git, UI, publication or promotion action.

Validation: dry-run valid3/reject0/skip0 (two corrections plus one new data-flow fact). SHA256 `3a13ee14f426017646c6564573b5048f2797f243ea7623af63e78239916b679b`. Citations exclude renderer terminal empty lines; full canonical/rendered coverage includes them.
