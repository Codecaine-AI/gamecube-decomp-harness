# Developer Object Allocation Limiter

Draft at frozen revision `c302741689bd67c361cd7faadb221df3193992c3`. Only `src/melee/db/dballoc.c` is manifest-owned. The canonical and rendered EOF snapshots are indexed in [coverage.json](coverage.json); foreign source snapshots and existing-object hashes are recorded separately. No canonical renames or shared KB changes are proposed by this document.

## Entry points and controller behavior

`fn_SetupObjAllocLimiter(void)` clears only the two software latches, leaving allocator flags and numeric limits intact. Repeated setup therefore need not mean enforcement is disabled. [src/melee/db/dballoc.c:9-13](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dballoc.c#L9-L13)

`fn_UpdateObjAllocLimiter(int player)` operates only when `DbLevel == DbLKind_Develop`. Held B plus newly pressed Up toggles the effect group; held A plus newly pressed Up independently toggles the generator/particle/SRT group. Both may run in the same call, effect group first. The player index is forwarded unchanged without local validation or a player-zero restriction. [src/melee/db/dballoc.c:15-62](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dballoc.c#L15-L62)

The caller invokes updates for players 0 through 3. Multiple players with the same chord can toggle a shared latch back during one caller pass. Pressed masks detect a transition into the current state; the accessors merely read arrays. [dbinit.c:99-107](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L99-L107) [dbinit.c:211-235](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L211-L235)

## Allocators and state flow

| Latch | Allocator | Population |
|---|---|---|
| b0 | efLib_AllocData | EF_Effect |
| b1 | hsd_804D0F90.alloc_data | HSD_Generator |
| b1 | hsd_804D0F60.alloc_data | HSD_Particle |
| b1 | HSD_PSAppSrt_804D10B0 | HSD_psAppSRT |

The allocator identities are independently supported by [eflib.c:154-158](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L154-L158), [generator.c:73-75](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L73-L75), [particle.c:348-349](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L348-L349) and [psappsrt.c:10-27](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L10-L27).

Enabling snapshots each allocator's own historical peak into its numeric limit, then sets enforcement. Disabling clears enforcement without clearing the number. These calls do not free existing objects. With numeric enforcement enabled, the allocation path returns NULL when `used >= num_limit` before consulting its free list. Freeing reduces `used`, permitting later reuse below the ceiling, while peak remains historical. [objalloc.h:47-70](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L47-L70) [objalloc.c:71-126](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L71-L126)

The private state is a byte union with one-bit fields, not two integer objects. Software latches can diverge from effective allocator flags after setup or foreign changes; update does not read those flags. [gm/types.h:22-34](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/types.h#L22-L34) [src/melee/db/dballoc.c:7-62](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dballoc.c#L7-L62)

## Section evidence and limits

Existing split/source objects respectively contain 16/11 bytes in `.data` (the terminated filename `objalloc.h`), 8/5 bytes in `.sdata` (terminated assertion text `data`), and 8/1 bytes in `.sbss`. The cause of the additional split bytes remains unverified; the source payloads do not establish 12-byte or eight-byte string objects. [object-evidence.json](object-evidence.json) records exact bytes and hashes. Header assertions explain the diagnostic strings. [objalloc.h:47-70](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L47-L70)

No rebuild, source-object equivalence check or full lifecycle audit is claimed. Only inspected caller and allocator dependencies support cross-file conclusions. Three outgoing relationships are supported. The fourth is rejected because its exact rationale equates software latches with allocator enabled state; see [link-dispositions.json](link-dispositions.json). Independent review and application remain pending.
