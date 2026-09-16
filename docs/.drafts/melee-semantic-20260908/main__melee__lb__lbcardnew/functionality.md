# lbcardnew Functionality

The unit keeps one shared card request context. Request builders append masked tasks, the dispatcher consumes one task at a time, and callbacks update pending and result state. A pending count blocks later tasks until polling resumes dispatch. Work buffers persist across request resets.

## Entry Points

| Canonical | Behavior |
|---|---|
| lb_80019BB8 | Converts raw CARD result0 to0, -4 to4, -6/-13 to9, -5/-128 to14, -1/-2/-3 to15; all other values return13. |
| lb_80019C38 | Returns first task slot whose x0 is14, asserting that one exists. Does not reserve or clear its payload. |
| lb_80019CB0 | Dispatches first active task when its x4 mask accepts 1 shifted by incoming result, otherwise clears task slots. Invokes opcode0..13 handler, immediately retires that task, and continues unless result11. At terminal completion invokes callback before clearing callback pointer, then conditionally unmounts. No result-shift bounds check or reentrancy protection. |
| lb_80019EF0 | Stores channel, save/status/callback pointers; clears transfer and catalog pointers, sets aggregate and nine converted statuses16 and raw statuses-1, clears mount flag and resets task opcodes. Does not reset pending count or work buffers. |
| fn_8001A008 | Converts CARD callback result, overwrites aggregate only for nonzero converted result, and decrements pending count without underflow guard. First argument unused. |
| fn_8001A0B0 | Converts HSD callback result, stores converted/raw values at unchecked file index, updates aggregate only for nonzero result, and decrements pending count without guard. |
| lb_8001A184 | Resets pending count, probes channel geometry, then on success clears optional status output, asserts work area and submits CARDMountAsync under disabled interrupts. Raw0/-6/-13 set mount flag; converted success increments pending. Returns11 if pending, otherwise converted result. |
| lb_8001A3A4 | Clears pending count and submits CARDCheckAsync on active channel under disabled interrupts. Converts immediate result and increments pending only on success; returns11 if pending else converted result. |
| lb_8001A4CC | Queues task2 with mask1, optional filename copied by full-buffer strncpy into x10 and xC pointing there, and file_entries in x8. Full-length input need not be terminated. |
| lb_8001A594 | Resets pending; rejects sector size other than8192 with12; queries free capacity; null filename returns7. Calls CARDOpen and then CARDClose even on open failure. Initializes HSD context after asserting library area. Existing file queues inspection. Absent file returns4 without entries,6 without free file slot, or5 if configured layout needs more free bytes; sufficient capacity returns4. |
| lb_8001A860 | Resets pending count and rewrites aggregate0 or2 to1, otherwise preserves aggregate. Returns aggregate, so a direct call with prior11 can still return11. |
| lb_8001A8A4 | Resets pending; if mount flag is set submits CARDFormatAsync under disabled interrupts, converts result and increments pending on success. With no mount flag returns prior aggregate unchanged. Returns11 whenever pending count is nonzero. |
| lb_8001A9CC | Resets pending and submits CARDDeleteAsync with active channel and supplied filename under disabled interrupts. Stores converted result, increments pending on success and returns11 if pending else saved result. |
| lb_8001AAE4 | Resets pending and submits CARDRenameAsync with active channel and supplied old/new names under disabled interrupts. Converts result and increments pending on success; returns11 if pending else saved result. |
| lb_8001AC04 | Passes shared context, filename, unk_14/18/1C and indexed callback to hsd_803B286C. Stores converted immediate result, increments existing pending count on success and returns11 if count is nonzero. Does not locally reset pending; byte-range interpretation of arguments is unverified. |
| lb_8001ACEC | Clears aggregate, loops indices0..8 with nonzero xF4, and calls hsd_803B29D8 with context,index,entries[index].data and indexed callback. Stores each immediate converted/raw result; successful submissions increment existing pending, errors overwrite aggregate. Attempts later enabled entries after failure; returns11 if pending. |
| lb_8001AE38 | Clears aggregate, loops indices0..8 with nonzero xF4, and calls hsd_803B2A4C with context,index,entries[index].data and indexed callback. Stores each immediate converted/raw result; success increments existing pending, errors overwrite aggregate. No pending reset or array/index checks. |
| lb_8001AF84 | Submits shared context and unk_14/18/1C to hsd_803B2928 with indexed callback. Converts result, increments existing pending on success and returns11 when pending. Foreign canonical path stages header data and reaches card writing, contradicting inherited ranged-read interpretation. |
| lb_8001B068 | Submits shared context and unk_14/18/1C to hsd_803B27F4 with indexed callback. Converts result, increments existing pending on success and returns11 when pending. Exact payload semantics require HSD owner review. |
| lb_8001B14C | Reports optional cached free capacity, allocates127 temporary nodes, scans127 CARD slots and admits successful statuses matching current disc company/game and a digit as first filename character. Parses decimal prefix and sorts descending, inserting later equal keys before earlier ones. Writes output records, clears only file_no for unused output slots, frees temporary nodes and forces aggregate0. Snapshot authenticity and valid timestamps are not checked. |
| lb_8001B614 | Scans127 CARD slots for successful status with matching shared two-byte company, four-byte game and exact filename. Sets aggregate0 on match or13 after no match, conflating failed status reads with absence; resets pending first. |
| lb_8001B6E0 | Returns converted per-file status at unchecked index; no state changes. |
| lb_8001B6F8 | Calls hsd_803AAA48, snapshots pending/result under disabled interrupts, chooses11 for any nonzero pending count and otherwise aggregate. After restoring interrupts dispatches any result other than11 and returns final status. |
| lb_8001B760 | Returns input unchanged unless11; then repeatedly calls poller until non11. Busy loop has no timeout or frame yield. |
| lb_8001B7E0 | Initializes request and queues mount0/65536,check1/513,preflight2/1,normalize3/-1, dispatches16 and busy-polls11 until terminal. Passes caller layout/save/status data into preflight. |
| lb_8001B8C8 | Initializes request, queues mount0/65536,check1/513,format4/-1, dispatches16 and busy-polls pending11. Returns integer status in C although public header declares bool. |
| lb_8001B99C | Initializes and queues mount,check,preflight,normalize,delete5/14 with copied filename, then dispatches16 without polling. There are five tasks including helper-generated preflight; strncpy32 need not terminate. |
| lb_8001BA44 | Builds same five-task delete sequence as lb_8001B99C and busy-polls pending11 before returning integer status. Public header declares bool despite C int signature. |
| lb_8001BB48 | Initializes with save/status data and queues mount,check,preflight,normalize,task7/mask16. Copies exactly32 bytes from filename and stores three transfer fields before dispatch16. Five tasks including preflight; fixed memcpy requires32 readable source bytes. Exact HSD payload interpretation is deferred. |
| lb_8001BC18 | Builds the same five-task task7 sequence as lb_8001BB48, copies32 filename bytes and stores unk_14/18/1C, dispatches16 and busy-polls pending11 until terminal. HSD scalar/pointer payload interpretation is deferred. |
| lb_8001BD34 | Initializes request and queues mount,check,preflight,normalize,task8/mask3 with entries, then dispatches16 and busy-polls11. Task8 passes enabled entry data pointers to hsd_803B29D8. |
| lb_8001BE30 | Initializes with status and completion callback, queues mount,check,preflight,normalize,task10/mask2 and task9/mask3. Stores three transfer fields for task10 and entries for task9, then dispatches16 without polling. Six tasks including preflight. Task10 reaches header/icon writing, not an established byte-range read; inherited offset/length names are misleading. |
| lb_8001BF04 | Initializes request and queues mount,check,preflight,normalize,task11/mask2 and task8/mask3. Stores three transfer fields and final entries, then dispatches16 without polling. Six tasks including preflight; exact payload direction and pointer roles require HSD owner review. |
| lb_8001BFD8 | Queues mount,check,null-filename preflight,normalize and catalog12/mask128; stores snapshot/free-capacity outputs and dispatches16, busy-polling11. Catalog filters digit-prefixed current-title filenames rather than verifying actual snapshots. |
| lb_8001C0F4 | Queues11 tasks implementing preflight and rename A-to-C,B-to-A,C-to-B, starting with mount/check. Each rename requires predecessor accepted by mask14. No rollback if later step fails. Copies32 bytes via strncpy into x19 declared char[7]; later unconditional name_b/name_c copies invalidate apparent optional preflight null branches. No general safe atomic-swap guarantee. |
| lb_8001C2D8 | Copies company2/game4/filename32 into shared filters and task13, queues mount/check/null-preflight/normalize/search and busy-polls11 after dispatch16. Filename may be unterminated; directory errors can appear as no match. |
| lb_8001C404 | Calls CARDProbeEx with caller channel and stack geometry outputs, discards geometry, returns lb_80019BB8 conversion. No local channel validation. |
| lb_8001C4A8 | Initializes shared HSD context with channel0,sector8192 and library area; attaches icon data; walks CardEntry array until size-1, skipping size0 while retaining index; returns hsd_803B2674. No sentinel, count or allocation checks; mutates shared context. |
| lbCardNew_AllocWorkArea | If work_area isNULL allocates0xA000 and0x2000 and stores both pointers. No allocation checks; successful first allocation with failed second leaves later calls unable to retry library allocation. |
| lb_8001C5A4 | Sets work_area and lib_areaNULL without freeing either region or resetting task/pending state. |
| lb_8001C5BC | Calls hsd_803B2374 then request initializer with channel0 and null pointers, then sets pending0. Does not clear retained work_area/lib_area pointers. |

## Constraints

Only one request context exists. Callback invocation precedes clearing its pointer and unmounting, so reentrant request construction can lose its callback or mount. Request reset leaves pending unchanged. Allocation checks only work_area; a failed second allocation may not be retried. Pointer reset frees no memory.

String copies have different hazards. memcpy reads32 bytes even from a shorter object, strncpy can omit termination, and rename destination x19 is declared seven bytes while receiving32. Swap sequencing has no rollback. Entry loops assume valid arrays and sentinels. Indexed callbacks and accessors do not bound indices.

Catalog scanning accepts only a digit prefix, parses decimal without overflow handling and reverses encounter order for equal keys. Successful catalog completion does not imply every CARDGetStatus succeeded. Only unused output file_no fields are cleared.

## Read/Write Contradiction

BE30 queues task10 then9 after preflight. Task10 stages64 bytes from caller data into HSD header storage, and its type4 command reaches low-level type9 card writing. The alleged offset/length integers become pointer-shaped icon/payload data. The inherited ReadFile and QueueRead aliases are unresolved and must not guide downstream game-data naming. Exact replacement names await HSD family review.

## Coverage

All1274 displayed lines across C and two owned headers are reviewed in canonical and rendered views. All43 targets,130 subjects and inherited facts are enumerated in findings.json with IDs and version hashes. The static header has3 render parser errors; source remains readable. Shared SDK/HSD types, foreign callers and compiled sections are not claimed as fully reviewed.

Polling has a second gate after the pending-count snapshot: aggregate11 skips dispatch even with zero pending. Formatting with no mount flag returns the prior aggregate without a CARD call. File-level payload descriptions do not establish byte-range semantics.
