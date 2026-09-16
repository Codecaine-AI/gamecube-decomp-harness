# main/sysdolphin/baselib/hsd_3B27

Status: TU synthesis complete; independent root review pending.

# Card Command Producer Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Full source lines 1-175 and header lines 1-20 read canonically and rendered; both renders report zero parse errors. Hashes, UTC interval and all 29 subject IDs are in coverage.json.

## Entry Points

### hsd_803B27F4

Queues command type 6 with arg0 through arg4 stored as f1 through f5. The consumer passes these to fn_803B26CC, whose parameters are state, file_id, seq_num, version and callback. Producer code does not establish that the middle arguments are a source buffer, byte offset and byte length.

The full guard is read_index == write_index and current slot.type != 0. It returns -265 without queue stores; acceptance advances write_index modulo 32 and returns zero. Pointer validity and concurrent producer access are not checked. Retained pointers are borrowed, with no lifetime management in this wrapper. Submission does not invoke the callback or imply completed I/O.

- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.c#L19-L46
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5390

### hsd_803B286C

Copies 64 bytes from arg2 into CardState.x370 before checking queue capacity, then queues type 3 with arg0,arg1,arg3,arg4,arg5 as f1 through f5. The consumer calls fn_803B1F78 with state, channel, file_id, seq_num and callback. Exact operation argument meaning needs card-family reconciliation.

The 64-byte context copy occurs before the full guard, including on -265 rejection. The full guard is read_index == write_index and current slot.type != 0. It returns -265 without queue stores; acceptance advances write_index modulo 32 and returns zero. Pointer validity and concurrent producer access are not checked. Retained pointers are borrowed, with no lifetime management in this wrapper. Submission does not invoke the callback or imply completed I/O.

- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.c#L48-L75
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5085-L5187

### hsd_803B2928

Copies 64 bytes from arg1 into CardState.x370 before checking queue capacity, then queues type 4 with arg0,arg2,arg3,arg4 as f1,f3,f4,f5. f2 is untouched. The consumer calls fn_803B21E8 with card_state,file_id,seq_num,callback; this wrapper does not enqueue arg1 as an output destination.

The 64-byte context copy occurs before the full guard, including on -265 rejection. The full guard is read_index == write_index and current slot.type != 0. It returns -265 without queue stores; acceptance advances write_index modulo 32 and returns zero. Pointer validity and concurrent producer access are not checked. Retained pointers are borrowed, with no lifetime management in this wrapper. Submission does not invoke the callback or imply completed I/O. Accepted writes leave f2 unchanged.

- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.c#L77-L103
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5190-L5252

### hsd_803B29D8

Queues one type-1 card command with context, logical entry index, data pointer and callback in f1,f2,f3,f5. f4 is untouched. The consumer calls fn_803ADF90 with a fixed fourth argument of 1.

The full guard is read_index == write_index and current slot.type != 0. It returns -265 without queue stores; acceptance advances write_index modulo 32 and returns zero. Pointer validity and concurrent producer access are not checked. Retained pointers are borrowed, with no lifetime management in this wrapper. Submission does not invoke the callback or imply completed I/O. Accepted writes leave f4 unchanged.

- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.c#L105-L130
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680

### hsd_803B2A4C

Requires the selected context x4C word to be positive, then queues type 2 with context, logical entry index, data pointer and callback in f1,f2,f3,f5. f4 is untouched. This prerequisite check does not validate index bounds.

First returns -257 when arg0[arg1 + offsetof(CardState,x4C)/sizeof(s32)] <= 0. No index bounds check precedes that read. The full guard is read_index == write_index and current slot.type != 0. It returns -265 without queue stores; acceptance advances write_index modulo 32 and returns zero. Pointer validity and concurrent producer access are not checked. Retained pointers are borrowed, with no lifetime management in this wrapper. Submission does not invoke the callback or imply completed I/O. Accepted writes leave f4 unchanged.

- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.c#L132-L165
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680

### hsd_803B2ADC

Copies an 18-byte banner/icon presentation descriptor into CardState.x3B0, computes its byte requirement through hsd_803AC340, stores the result in x24 and returns zero.

Unconditionally copies 18 bytes into x3B0, overwrites x24 with the helper result, and returns zero. No pointer validation or queue operation occurs.

- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.c#L167-L174
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1511-L1553
- code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L817-L845
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardnew.c#L1093-L1117

## Naming and Context

All six function aliases and the file alias card remain unresolved hypotheses. No new name is promoted. lbcardnew uses write_buf/read_buf and offset/length names, but the downstream consumer names the same payload slots file_id, seq_num and version and builds header commands. Neither set of source names alone settles the end-to-end meaning. The proposal replaces unsupported producer range descriptions with exact field mapping and preserves this conflict for family review.

Consumer immediate-error callbacks use entry index for types 1/2 and zero for types 3/4/6. The producers do not invoke callbacks. Type 2 dispatch selects among three lower routines using context offset 0x28. Borrowed pointers have no wrapper-owned lifetime. No locking or atomic publication protocol is shown.

The 18-byte descriptor uses banner format at byte 0, icon formats at bytes 2-9 and speed/activation bytes at 10-17. hsd_803AC340 scans active frames until the first zero speed byte and returns base plus icon/palette bytes plus 0x40. The reviewed lbcardnew caller installs this descriptor before registering components and calculating capacity. Snapshot-specific reachability remains deferred.

## Header and Coverage

The header declares all six functions and defines no shared types. Const context parameters in the staging wrappers do not imply immutable storage because their implementations cast to CardState* before memcpy. Manifest has 22 parameter entities; absent callback entities are recorded as inventory exceptions. Each existing fact has an explicit ID, updated_at version, disposition and pinned canonical evidence.

Static semantic review and proposal dry-run only. No source or shared KB changes, matching runs, publication or server actions.

{"targets": 6, "entities": 23, "subjects": 29, "facts": 42, "retained": 12, "superseded": 19, "unresolved": 11, "proposed_facts": 41}


## TU independent review

All owned C175/H20 lines independently reviewed canonically and in separate rendered views. Six producer/configurator signatures match the header; proposed function aliases remain hypotheses. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.h#L8-L17`.

Type3 and type4 copy64 bytes before checking capacity, so full rejection still changes context. Type4 leaves f2 untouched; types1/2 leave f4 untouched. Type2 prerequisite index has no bounds guard. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B27.c#L48-L165`.

Foreign canonical-only consumer review confirms dispatch payloads and immediate-error callbacks. Consumer names file_id/seq_num/version contradict unqualified producer byte-range interpretations, which remain deferred. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L591-L680`.

Foreign canonical-only function signatures read at5085-5105,5190-5205,5366-5390 confirm state/channel/file_id/seq_num and state/file_id/seq_num/version roles. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L5366-L5390`.

Foreign canonical-only caller493-580 scans nine entries, passes data and callback, records errors and increments outstanding count. Caller1093-1117 installs descriptor before registering entries and final capacity. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardnew.c#L493-L580`.

Foreign canonical-only helper1511-1553 computes banner/icon bytes plus0x40; setup817-845 supports icon interpretation. TU data-flow fact still says ranges and is deferred; type1 mapping also retains an unsupported separate ranged-write comparison. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L1511-L1553`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
