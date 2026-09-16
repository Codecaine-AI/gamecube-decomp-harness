# HSD memory-card command layer

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical C1–5392/H1–102 and separate rendered views reviewed. UTC 2026-09-08T15:52:05.791397+00:00 to 2026-09-08T16:02:13.745469+00:00.

## Entry-point findings

### hsd_803A949C
Handles completion of asynchronous GameCube CARD operations for HSD's queued memory-card layer. It interprets the completed command, closes open files where required, validates or extracts data from completed reads, records operation or integrity failures, and finally releases the asynchronous busy state and advances the command queue.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L142-L587

### fn_803AA790
Dequeues and dispatches one request from HSD's 32-entry high-level memory-card request ring. It selects an operation-specific load, update, recovery, cleanup, or compound card routine and immediately reports negative setup results through the request callback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680

### hsd_803AAA48
Pumps HSD's memory-card command queues, consuming completed or failed commands and starting the next queued CARD or compound maintenance operation unless asynchronous work is already active.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L896-L1430

### fn_803AC168
Attempts to append one nine-word command to the 128-slot card ring. Ordinary modes reject the occupied equal-cursor state with -265; mode2 bypasses that test. Success advances the producer before copying the command and returns0. This is queue admission, not I/O completion or a general concurrency-safety guarantee.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1432-L1463

### fn_803AC258
Queues an asynchronous read of one physical memory-card data block so the card subsystem can validate that block and update its logical-block and sequence maps. Compound maintenance invokes it once per physical block before reconciliation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1465-L1476

### fn_803AC2A4
Queues the command that reconciles a memory-card state's logical-to-physical block mapping after its sectors have been read. The command processor executes reconciliation synchronously and may queue cleanup or redundancy-restoration work.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1478-L1484

### fn_803AC2D4
Begins a recoverable command-queue construction scope by checkpointing the current producer cursor, allowing all commands appended during compound setup to be discarded if any enqueue step fails.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1486-L1489

### fn_803AC2E0
Rolls back a partially constructed batch of memory-card commands by invalidating every command appended since a saved producer checkpoint and restoring the producer cursor.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1491-L1504

### fn_803AC334
Commits a checkpointed batch of memory-card commands after every command has been queued successfully by invalidating the saved producer-index checkpoint so rollback can no longer discard the batch.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1506-L1509

### hsd_803AC340
Calculates the total byte length of an HSD memory-card file's presentation-data region from its 0x40-byte metadata header, including the selected banner representation, up to eight active icon frames, and any shared icon palette.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1511-L1553

### hsd_803AC3E0
Registers one indexed logical file component in an HSD memory-card layout by recording its flags, allocated byte size, and payload-data pointer.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1555-L1561

### fn_803AC3F8
Serializes a three-entry window of the memory-card logical-file table into the 12-byte metadata area of a protected save-data block header. Each four-byte descriptor identifies one logical file and packs its two-bit flags with its size.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1563-L1595

### hsd_803AC558
Decodes a compact three-entry file-metadata table from a memory-card block into `CardState`, installing each record's logical slot, two-bit flags, and byte size only when the encoded size is nonzero and the slot is still empty.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1597-L1616

### fn_803AC634
Calculates how many sector-sized storage blocks one indexed logical-file payload needs in an HSD memory-card container, accounting for the 0x20-byte per-block header and the first payload's reduced initial-block capacity.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1618-L1643

### fn_803AC6B8
Calculates the number of physical memory-card blocks preceding a selected logical file in an HSD card-file layout, accounting for the initial metadata-bearing block, the first payload's reduced initial capacity, and the 0x20-byte overhead in each subsequent block.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1666-L1711

### fn_803AC7DC
Calculates the physical data-block capacity required by an HSD memory-card file's configured logical payloads and redundancy modes. The result bounds the card state's block maps and is used to reject layouts whose available data-block count is inconsistent.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1767-L1807

### fn_803ACB74
Compares two memory-card block sequence markers with wraparound awareness so duplicate mappings of one logical block can be resolved in favor of the newer physical copy.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1809-L1830

### fn_803ACBE8
Locates a physical HSD data-block slot in a CARD file: sector_size * (physical_block_idx + ceil((x24+48)/sector_size)-1), using the literal unsigned arithmetic in the body. The stored logical block identifier is independent of the physical slot.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1832-L1844

### fn_803ACC0C
Reads one sector belonging to a block of an open memory-card file and verifies that the decoded block has the expected file identifier, sequence number, and payload bytes.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1845-L1915

### fn_803ACD58
Synchronously compares the presentation region of an open CARD file sector by sector:64-byte metadata, optional format-dependent banner, and the remaining icon bytes through x24. Returns0 for matching compared bytes,1 on mismatch, or negative read status. It does not decrypt or recompute/compare the trailing checksum collection.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1917-L2009

### fn_803ACF30
Queues the complete sector-by-sector read of an HSD memory-card data image, including the 0x30-byte integrity trailer, and stops at the first command-admission failure.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2011-L2031

### fn_803ACFC0
Serializes and synchronously writes one protected logical save-data block into an open GameCube memory-card file, including its block header, packed neighboring-file metadata, padded payload, checksum, and encryption.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2045-L2125

### fn_803AD16C
Validates and reconciles an HSD memory-card file's logical-to-physical block map. It selects a complete sequence-consistent physical block set for each of nine logical payloads, reports incomplete or mixed-generation mappings, invalidates unwanted redundant blocks, and queues block-copy or disposal commands needed to restore the configured redundancy layout.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2260-L2503

### fn_803ADE4C
Transactionally starts asynchronous validation and maintenance of an existing HSD memory-card file by staging status inspection followed by full-image and physical-block validation and reconciliation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2505-L2557

### fn_803ADF90
Loads one logical payload from an HSD block-structured memory-card file. It reconstructs the payload's ordered physical-block map, rejects incomplete or sequence-inconsistent mappings, and then either reads, validates, and copies the blocks synchronously or submits an equivalent batch of low-level read commands for asynchronous completion.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2809-L2987

### fn_803AE7F8
Validates and updates one mode-0 logical payload in an HSD memory-card container, where the redundancy policy maintains two complete physical copies. It reconstructs the two block maps, checks whether both copies belong to the newest sequence and already contain the requested payload, fills missing mappings from free blocks, and, when verification fails, rewrites the available copies with an incremented sequence.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3020-L3435

### fn_803AF3F0
Updates one indexed logical payload using current, secondary and free block lists. It verifies a consistent current generation before writing and tries to build the replacement from secondary/free slots; when those are insufficient it reuses current primary slots, so preservation of a complete prior generation is not guaranteed. Replacement increments the8-bit sequence and retires remaining old mappings after synchronous writes or during deferred finalization.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3646-L3956

### fn_803B0120
Mode3 logical-payload update path: selects usable physical slots, verifies the stored generation, and stages or performs cleanup/rewrite. The synchronous path with remaining secondary blocks returns after the first cleanup write, before any payload replacement. Async construction and sync paths without that cleanup condition can reach full replacement.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4084-L4411

### fn_803B0E9C
Builds and writes the HSD CARD presentation region:64-byte metadata, optional banner, icon material and a48-byte checksum collection. Non-initializing mode compares before rewriting; queued mode stages comparisons and writes, while synchronous mode performs CARD I/O through an already-open file. Snapshot-specific use is not established by this generic size helper.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4488-L4682

### fn_803B1338
Writes every configured logical payload in a `CardState` into the HSD memory-card file's protected block layout. It handles file zero's partially occupied first sector, emits the remaining blocks for logical files 0 through 8, allocates redundancy blocks according to each file's redundancy mode, and emits any required duplicate copies. The operation can either enqueue block-write commands or perform the writes synchronously.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4765-L5083

### fn_803B1F78
Builds and submits the queued transaction that creates a complete HSD memory-card file, writes its header, icon, digest, and configured data blocks, updates banner/icon status, and registers final completion.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5085-L5188

### fn_803B21E8
Transactionally stages an asynchronous update of an existing HSD memory-card file by queuing comparison and conditional replacement of file contents, a CARD status update, and final callback completion.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5190-L5253

### hsd_803B2374
Initializes the lower-level HSD memory-card command runtime by clearing secondary queue storage, resetting primary and secondary queue cursors, marking all 128 primary command slots inactive, clearing the prior operation result, and restoring the initial control state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5255-L5269

### hsd_803B24E4
Initializes an HSD memory-card operation context for subsequent file inspection, layout construction, and capacity calculation. It clears the complete `CardState`, installs the caller's work buffer, card channel, and sector-size value, and initializes the embedded file-number field to an invalid sentinel.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5271-L5278

### hsd_803B2550
Submits asynchronous inspection and validation of an existing named HSD memory-card file. It resolves the filename to a numeric CARD file index, closes the temporary handle, and publishes a type-5 secondary request whose dispatcher starts the HSD status, image, and physical-block validation sequence and ultimately reports completion through the supplied callback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5285-L5352

### hsd_803B2674
Refreshes presentation byte count x24 and returns ceil((x24+48)/sector_size) plus physical data/spare/duplicate block count. The48 bytes are the trailing presentation checksum collection, not a file prefix. No sector-size, arithmetic-overflow or map-capacity validation is performed.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5354-L5364

### fn_803B26CC
Stages callback-driven reads of the CARD presentation region and its checksum collection. Refreshes x24, queues type11 reads for each covering sector, rolls back the checked failed prefix and installs completion context5 on success.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5391

## Corrections and boundaries

### fn_803AA790: inferred_type
Signature s32 fn_803AA790(void). Consumes a 32-entry ring of CardQueueEntry records, each six target-sized words: type, context, three operation-specific words, and optional void (*)(s32,s32) callback. The source describes a 24-byte target layout; this is not proof that separately defined globals form one C object.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680

### fn_803AC168: data_flow
Disables interrupts only to snapshot consumer cursor, mode and current type, then restores interrupts before admission and insertion. On admission it saves the current producer index, advances the volatile producer modulo128, and only then copies sizeof(CardCmd), nine target-sized words, from the caller to that slot. Mode2 becomes0. The copy and producer publication are not one interrupt-masked operation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1432-L1463

### fn_803AC168: purpose
Attempts to append one nine-word command to the 128-slot card ring. Ordinary modes reject the occupied equal-cursor state with -265; mode2 bypasses that test. Success advances the producer before copying the command and returns0. This is queue admission, not I/O completion or a general concurrency-safety guarantee.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1432-L1463

### fn_803AC258: data_flow
Builds type13 with state, physical block index in x10, x14=0, x18=NULL, x20=0 and a calculated byte offset in x1C. x8 and xC remain uninitialized although enqueue copies the complete nine-word record. Dispatch reads one sector into state->x0; completion validates or invalidates x170[block_idx]/x270[block_idx] and merges file-table metadata.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1465-L1476

### fn_803AC6B8: inferred_type
Read-only s32 (CardState*, s32 file_count) prefix-block calculation. Zero and values>=9 return0, but negative values are not rejected: they follow the initial file-zero contribution and skip the later loop. For indices1–8 it returns the initial block/file-zero contribution plus positive payload counts for files1 through file_count-1. No sector-size or overflow validation is performed.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1666-L1711

### fn_803ACBE8: inferred_type
Read-only s32 (CardState*,s32 physical_block_idx) byte-offset query. The block argument indexes the physical data-block region, as shown by type13 scan and mapped read/write callers; the logical identifier stored inside a block is a separate value. Arithmetic uses u32 sector/header values and has no zero-size or overflow guards.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1832-L1844

### fn_803ACBE8: purpose
Locates a physical HSD data-block slot in a CARD file: sector_size * (physical_block_idx + ceil((x24+48)/sector_size)-1), using the literal unsigned arithmetic in the body. The stored logical block identifier is independent of the physical slot.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1832-L1844

### fn_803ACBE8: game_mapping
Supports GameCube memory-card I/O by translating a physical HSD data-block index into its CARD-file byte offset. Logical payloads first use x170 mapping information to select a physical slot.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1832-L1844

### fn_803ACC0C: inferred_type
Synchronous s32 (CardState*,s32 physical_block_idx,s32 expected_logical_id,s32 expected_sequence,void* expected_data,s32 data_size). State supplies an already-open CARD file and sector buffer. Zero size returns0 immediately. Otherwise returns0 on match,1 for integrity or content mismatch, or a negative CARD read result. It checks the decoded16-bit logical ID and8-bit sequence without truncating the expected s32 arguments.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1845-L1915

### fn_803ACD58: game_mapping
Compares an open HSD CARD file presentation region against the expected64-byte metadata, optional banner and icon bytes, allowing a matching region to skip reconstruction. It neither reads logical-file payload blocks as such nor validates the appended48-byte checksum collection; those are handled by separate paths.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1917-L2009

### fn_803ACD58: purpose
Synchronously compares the presentation region of an open CARD file sector by sector:64-byte metadata, optional format-dependent banner, and the remaining icon bytes through x24. Returns0 for matching compared bytes,1 on mismatch, or negative read status. It does not decrypt or recompute/compare the trailing checksum collection.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1917-L2009

### fn_803AD16C: state_behavior
First copies indices0 through x460 into64-entry local arrays, then checks x460 against the calculated extent; no capacity check precedes the copy. Selects complete sequence generations per nonempty file, otherwise salvages partial maps with -0x103/-0x104. Modes1/2 negate redundant mappings; mode0 retains one duplicate, queues disposal of extras and read/write repair for missing or stale copies. Queue failures contribute -0x10B or -0x102 under the explicit precedence guards. No free duplicate slot can leave result unchanged. It does not roll back queued repairs or immediate map mutations; queue-copy helpers also expose undersized local command arrays in source.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2260-L2503

### fn_803ADF90: inferred_type
s32 (CardState*,s32 file_idx,u8* destination,s32 async,void (*callback)(s32,s32)). Nonzero async builds queued reads and records the callback; zero performs synchronous I/O. Read helpers skip copying when destination is NULL, but the enclosing function still advances destination and has zero-fill branches, so NULL is not a general safe clear-only mode. Missing/mixed maps produce -259/-260; busy sync entry -264; sync read/decode failures normalize to -259 and final close failure to -267.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2809-L2987

### fn_803AF3F0: purpose
Updates one indexed logical payload using current, secondary and free block lists. It verifies a consistent current generation before writing and tries to build the replacement from secondary/free slots; when those are insufficient it reuses current primary slots, so preservation of a complete prior generation is not guaranteed. Replacement increments the8-bit sequence and retires remaining old mappings after synchronous writes or during deferred finalization.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3646-L3956

### fn_803AF3F0: game_mapping
Implements a generation-based save-component update with compare-before-write and alternate-block selection. The fallback can reuse current blocks when secondary/free capacity is insufficient; its source does not guarantee that a recoverable complete prior generation survives an interrupted update.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3646-L3956

### fn_803B0120: state_behavior
Sync entry rejects busy1 with -264; missing primary slots consume secondary then free slots, exhaustion -257. A consistent matching generation closes and returns1. On rewrite, the synchronous secondary-cleanup loop writes only its first remaining secondary block, invalidates its map, and unconditionally returns that write result: success returns0 before payload rewrite and without closing. With no remaining secondary blocks, sync rewrites selected blocks at the incremented8-bit sequence and closes, normalizing final close failure to -267. Async stages all cleanup and rewrite commands, rolls back checked enqueue failures and installs completion context4.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4084-L4411

### fn_803B0120: inferred_type
Semantic s32 (CardState*,s32 file_idx,const void* payload,s32 async,void (*callback)(s32,s32)). A sync return1 means compared bytes already match. Return0 can mean completed rewrite, queued admission, or only the first secondary cleanup succeeded before an early return. Negative CARD/queue/capacity statuses propagate; the source therefore does not support treating every0 as payload replacement completion.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4084-L4411

### fn_803B0120: purpose
Mode3 logical-payload update path: selects usable physical slots, verifies the stored generation, and stages or performs cleanup/rewrite. The synchronous path with remaining secondary blocks returns after the first cleanup write, before any payload replacement. Async construction and sync paths without that cleanup condition can reach full replacement.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4084-L4411

### fn_803B0120: game_mapping
Provides verification, mapping recovery, cleanup and replacement paths for a logical memory-card save component. The synchronous secondary-cleanup early return prevents an unconditional claim that successful invocation creates a coherent replacement generation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4084-L4411

### fn_803B0E9C: data_flow
Caches hsd_803AC340(&state->x3B0) in x24. Serializes64-byte metadata, format-dependent banner bytes from arg1, remaining icon bytes from arg2, and48 bytes holding up to three16-byte segment checksums. Sync writes use the shared sector buffer with read/clear preservation branches; queued mode emits type10 comparison, type6 comparison marker, final-sector read/clear and type9 writes. No local rollback, bounds checks or open/close ownership. The format is shared HSD card presentation data, not source-proven snapshot image payload.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4488-L4682

### fn_803B0E9C: purpose
Builds and writes the HSD CARD presentation region:64-byte metadata, optional banner, icon material and a48-byte checksum collection. Non-initializing mode compares before rewriting; queued mode stages comparisons and writes, while synchronous mode performs CARD I/O through an already-open file. Snapshot-specific use is not established by this generic size helper.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4488-L4682

### fn_803B1338: state_behavior
Emits file0, files1–8, shared spare blocks, then mode0 duplicates. Mode1 raises the spare count to full-file size, mode2 to at least1. Spare blocks carry IDFFFF and no payload. Supplied data is consumed in full block-capacity chunks even for a partial final logical payload; callers must provide suitable storage. Preliminary block-zero read enqueue results are ignored. The synchronous initial file0 write tolerates -0x105 and does not install its success mapping; other ordinary successes update maps and failures invalidate. Queued partial work remains on failure unless an enclosing caller rolls it back.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4765-L5083

### fn_803B1F78: inferred_type
ABI s32 (CardState*,s32 filename,s32 banner_data,s32 icon_data,s32 callback). The latter four words encode pointers on the target: filename for CARDCreateAsync, optional banner and icon sources for the presentation writer, and void (*)(s32,s32) completion callback. Returns0 after staging or the first checked negative queue error; existing parameter names channel/file_id/seq_num do not express these uses.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5085-L5188

### fn_803B1F78: data_flow
Calculates allocated bytes as sector size times hsd_803B2674. Passes the second argument as filename in type7, and the third/fourth as banner/icon source pointers to fn_803B0E9C. Stages all configured logical payload blocks with fn_803B1338, then type8 status update. Installs completion context6 with callback argument0 after checked staging succeeds.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5085-L5188

### fn_803B26CC: data_flow
Refreshes x24 from presentation metadata, checkpoints the producer and passes state plus three optional destination pointers encoded as s32 to queueHeaderBlocks. Type11 completion treats them as metadata, banner and icon output buffers, then checks the checksum collection. Success publishes context5/callback argument0; checked failure removes the queued prefix.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5391

### fn_803B26CC: inferred_type
ABI s32 (CardState*,s32 metadata_out,s32 banner_out,s32 icon_out,void (*callback)(s32,s32)). The three scalar words encode optional target pointers, not file ID, sequence or version. Returns0 after queued header-read staging or a negative enqueue result after rollback. Completion callback receives argument0 and aggregate status.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5391

### fn_803B26CC: purpose
Stages callback-driven reads of the CARD presentation region and its checksum collection. Refreshes x24, queues type11 reads for each covering sector, rolls back the checked failed prefix and installs completion context5 on success.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5391

### fn_803B26CC: game_mapping
Supports GameCube memory-card presentation-data loading by queuing optional metadata, banner and icon outputs with checksum verification and callback completion. Queue-construction rollback is not a claim of interrupt-atomic submission or physical I/O rollback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5391

### fn_803B26CC: state_behavior
Saves the producer cursor and removes the newly appended prefix on a negative builder result. Success publishes context5, state, callback and callback argument0, then sets checkpoint=-1. Construction is not interrupt-masked as a whole; queued outputs can be copied before terminal checksum validation reports failure.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5391

### hsd_803AAA48: inferred_type
Parameterless cooperative command pump, void(void), driven by shared context, queue indices, result and busy state. Returns immediately for busy1 and after successful async launch. Some branches synchronously call CARDGetStatus, CARDFastOpen/CARDClose retry wrappers and reconciliation, so nonblocking is not a general timing guarantee.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L896-L1430

### hsd_803AAA48: state_behavior
Busy1 returns. A negative shared result discards queued nonzero commands until an empty slot. Result2 skips later verify commands; type6 maps2 to0, otherwise sets1; result1 skips conditional reads, clears and writes. Empty-slot finalization may reconcile duplicate maps for context3, calls the completion callback before clearing context type, resets result and mode2, and dispatches secondary work. Async startup errors set a negative result and continue toward flushing; completion itself does not pump the next command.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L896-L1430

### hsd_803B2550: state_behavior
Retries CARDOpen at most10 times only on -1. Its following loop inspects a cached fileNo value without re-reading or waiting on CARD; a negative cached value returns before close. Otherwise retries close at most10 times on -1 but ignores the final close status. Rejects an occupied equal-cursor secondary ring with -265; success writes type5, state, numeric fileNo and callback, advances producer modulo32 and returns0. No full critical section protects admission/publication.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5285-L5352

### hsd_803B2674: purpose
Refreshes presentation byte count x24 and returns ceil((x24+48)/sector_size) plus physical data/spare/duplicate block count. The48 bytes are the trailing presentation checksum collection, not a file prefix. No sector-size, arithmetic-overflow or map-capacity validation is performed.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5354-L5364

## Callback and queue details

Type2 close failure after a negative logical ID records the original successful completion result, potentially swallowing the close error. Type13 read/decode failures invalidate mapping without setting the shared error; its close result is ignored. Type11 copies optional outputs before final checksum validation. Type5/10 mismatches use positive2; type6 converts that into rewrite-control0 or already-matching1. Busy is only a sampled state, not a lock around all high-level setup. Callback chan is not checked against the selected active state. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L142-L587; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L896-L1430.

The mapper arrays have64 entries, but scans use inclusive x460 or calculated counts without capacity guards. Logical payload indices, sector divisions, payload lengths and metadata indices are unchecked at the low-level entry points. The file-table encoder writes three records, and its i<3 && i<9 loop does not guard start+i<9. Decoder uses the encoded u8 index directly into nine-entry arrays. Full-block initialization writes full-capacity chunks rather than bounding final copies by the declared file size. These are literal source boundaries, not runtime failure claims. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1563-L1765; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2260-L2503; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4765-L5083.

External work-area globals are separately defined, but this unit casts the16-byte context base to a structure covering following queues. Source declarations alone do not establish the combined object or linker adjacency. Initializer clears named queues/cursors/results but not active context or checkpoint. Header declares some foreign work objects differently from their owning definitions. No compiled extent or relocation claim accepted. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L65-L123; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5255-L5278; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.h#L85-L99; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_4D11.c#L10-L25.

## Source-only helpers

hsd_803A949C_Close: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L125-L140
retryCardFastOpen: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L696-L712
retryCardReadAsync: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L713-L730
retryCardWriteAsync: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L731-L748
retryCardClose: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L749-L764
retryCardCreateAsync: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L765-L782
retryCardGetStatus: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L783-L798
retryCardSetStatusAsync: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L799-L816
setupCardIcons: Packs2-bit icon format/speed fields until first zero speed or eight entries; supplied values are not masked before shifting. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L817-L833
unpackCardStat: Decodes status formats/speeds, recalculates x24 and derives x460 by unsigned length/sector arithmetic before caller validates iconAddr. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L834-L851
rollbackCardCommands: Clears queued type words back to a saved producer position; leaves checkpoint itself active and cannot undo I/O or immediate map changes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L852-L861
initHeaderBlockCommand: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L862-L872
queueHeaderBlock: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L873-L880
queueHeaderBlocks: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L881-L894
fn_803AC6B8_first_block_count: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1645-L1664
fn_803AC6B8_blocks_before: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1713-L1737
fn_803AC7DC_block_count: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1739-L1765
fn_803ACFC0_header: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2035-L2038
fn_803ACFC0_checksum_start: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2040-L2043
fn_803AD16C_file_type_nonzero: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2127-L2130
fn_803AD16C_total_blocks: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2132-L2135
fn_803AD16C_logical_index: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2137-L2140
fn_803AD16C_file_size: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2142-L2145
fn_803AD16C_seq_at: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2147-L2150
fn_803AD16C_nonnegative: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2152-L2155
fn_803AD16C_queue_cmd: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2157-L2160
fn_803AD16C_same: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2162-L2165
fn_803AD16C_own: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2167-L2170
fn_803AD16C_queue_clear: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2172-L2187
fn_803AD16C_queue_read: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2189-L2208
fn_803AD16C_queue_write: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2210-L2232
fn_803AD16C_queue_write_last: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2234-L2258
queueCardCommand2First: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2559-L2572
queueCardCommand2Final: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2574-L2604
calculateDataBlockSize: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2606-L2613
calculateFileBlockCount: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2615-L2638
retryCardRead: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2640-L2652
cancelQueuedCardCommands: Clears queued type words back to a saved producer position; leaves checkpoint itself active and cannot undo I/O or immediate map changes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2654-L2669
queueClearDataBlock: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2671-L2703
queueDataBlockFirst: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2705-L2710
queueDataBlockFinal: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2712-L2717
cardDataBlockOffset: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2719-L2730
readCardDataBlockFirst: Synchronous sector read and in-place decode; optional destination copy starts after32-byte block header. Does not verify expected logical ID/sequence; caller owns open/close. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2732-L2758
readCardDataBlockFinal: Synchronous sector read and in-place decode; optional destination copy starts after32-byte block header. Does not verify expected logical ID/sequence; caller owns open/close. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2760-L2799
loadCardDataBlock: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2801-L2804
fn_803AE7F8_rewind: Clears queued type words back to a saved producer position; leaves checkpoint itself active and cannot undo I/O or immediate map changes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L2992-L3007
fn_803AE7F8_close: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3009-L3018
fn_803AF3F0_chunk_size: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3437-L3440
fn_803AF3F0_queue_verify_first: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3442-L3461
fn_803AF3F0_queue_verify_final: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3463-L3485
fn_803AF3F0_queue_write_first: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3487-L3521
fn_803AF3F0_queue_write_final: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3523-L3559
fn_803AF3F0_rewind: Clears queued type words back to a saved producer position; leaves checkpoint itself active and cannot undo I/O or immediate map changes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3561-L3576
fn_803AF3F0_close: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3578-L3587
fn_803AF3F0_open: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3589-L3601
fn_803AF3F0_check_seq: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3603-L3615
fn_803AF3F0_calc_file_blocks: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3617-L3644
fn_803B0120_first_chunk: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3958-L3964
fn_803B0120_rewind: Clears queued type words back to a saved producer position; leaves checkpoint itself active and cannot undo I/O or immediate map changes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3966-L3981
fn_803B0120_close: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3983-L3992
fn_803B0120_close_result: CARD retry wrapper: repeats only result -1 up to the literal ten-attempt bound. Void close wrappers ignore the terminal close status. retryCardRead trusts its starting retry count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L3994-L4008
fn_803B0120_block_offset: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4010-L4021
fn_803B0120_queue_verify: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4023-L4045
fn_803B0120_queue_write: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4047-L4082
fn_803B0E9C_read_icons: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4413-L4433
fn_803B0E9C_write_block: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4435-L4451
fn_803B0E9C_write_block_final: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4453-L4469
fn_803B0E9C_read_first: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4471-L4486
fn_803B1338_queue_write: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4684-L4716
fn_803B1338_data_at: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4718-L4721
fn_803B1338_data_size: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4723-L4726
fn_803B1338_queue_write_data: Command constructor/forwarder; only assigned fields are initialized. Block-zero write helpers ignore preliminary read enqueue status. MUST_MATCH storage adjustments and AD16C eight-word locals do not establish safe source object bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4728-L4763
hsd_803B2550_inline: Local arithmetic, pointer, field or predicate helper reviewed with its enclosing entry point; no additional input validation or ownership guarantee beyond its literal body. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5280-L5283

## Exact review coverage

{"functions": 37, "sections": 2, "file_entities": 1, "parameters": 97, "existing_facts": 229, "proposed_facts": 33, "dispositions": {"unresolved": 10, "retain": 186, "supersede": 33}, "existing_links": 60, "link_dispositions": {"retain": 46, "reject": 4, "unresolved": 10}}

All229 exact baseline records and60 exact outgoing links preserve IDs, values, timestamps and digests, including duplicates. All97 empty parameter subjects were reviewed against definitions and uses. Canonical names retained. Source-only macros/types/data are recorded in coverage.json. Five C parser errors, zero H parser errors; reading substitutions were never treated as evidence. Historical PR/Discord/wiki evidence not revalidated. No source/shared KB writes, matching, Git, UI, runtime or publication work.
