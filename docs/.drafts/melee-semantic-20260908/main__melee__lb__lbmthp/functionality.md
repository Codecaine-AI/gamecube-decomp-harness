# lbmthp Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reviewed 695 canonical and rendered lines across 3 owned files; 21 target functions, 3 inline helpers, 4 data targets, 26 entities and all 151 inherited facts. All 25 empty parameter entities have explicit reviewed_empty entries.

Dispositions: {'unresolved': 46, 'retain': 49, 'supersede': 54, 'clear': 2}. Proposal operations: 56 including 2 alias clears.

## fn_8001E910

Completion callback ignores its first three arguments and asserts cancelflag is zero. Records signed tick difference, increments unk_108, updates file offset using unk_74 and previous packed size, and reads the next packed size from the preceding producer slot. If producer differs from selected decode slot and unk_70 is nonzero, enters a critical section and may submit the next aligned read, wrapping movie index only when looping and producer index at capacity. Sets pending only after submission; all no-request paths clear it. No callback result/error argument is otherwise checked.

## fn_8001EB14

Calls THPInit, resolves the filename and requests the first 0x40 bytes into the supplied state through lbFile_800161C4. Copies header frame count, dimensions and buffer size into working fields. Unsupported offsets and version greater than two only produce warnings. Sets unk_11C, unk_6C and unk_70 to one, clears pending and timing fields, and returns one without checking path or transfer success.

## fn_8001EBF0

Selects 32 ring entries and returns 32*ALIGN_32(slot_size)+width*height+2*((width*height)>>2)+THPDec_8032FD40 result+ALIGN_32(32*4)+ALIGN_32(frame_count*4). Writes decoder sizing inputs, clears local frame/snapshot indices and loop flag, sets decoded index -1, and narrows width/height into u16 fields. Arithmetic overflow and dimensions are unchecked; sizing is mutating, and reserving a per-frame table does not show that initialization installs one.

## fn_8001ECF4

Uses caller buffer for the pointer table, advances by aligned pointer-table bytes, and clears unk_64. If unk_6C and unk_11C are nonzero, fills exactly unk_104 slots without stopping at total movie frames, asserts each packed size nonzero, follows each record's next-size word and advances slots by unaligned unk_100. Sets producer zero and available/minimum counts to capacity minus one. If the guard is false, packed slots are neither reserved nor initialized. Places one full-area and two quarter-area output buffers next, invalidates their cache ranges and saves the following workspace address. Buffer alignment, packed-size fit and capacity are not checked here.

## fn_8001EF5C

If selected ring index differs from decoded index, calls THPVideoDecode under disabled interrupts with slot address plus four, stores its return in unk_98, and passes that value to a width-640-specific or general output helper. Only the width-640 branch explicitly stores the three plane cache ranges. Publishes decoded index under disabled interrupts and returns fn_8001F13C's result. A repeated index returns that index without decoding or requesting a refill. Decode status spC is not inspected.

## fn_8001F06C

Disables interrupts and advances when unk_108 is positive or unk_6C equals zero. This mode field differs from asynchronous request gate unk_70. Increments movie frame; equality with total wraps if looping or rolls back and exits without consuming a slot otherwise. Successful advancement increments/wraps consumer index and decrements available count. Updates the minimum even when the initial advance guard fails, except the end-of-movie early exit bypasses that update. Restores interrupts and returns one.

## fn_8001F13C

Under disabled interrupts, submits an aligned compressed read only if producer differs from selected decode index, pending is zero, unk_70 is nonzero, and requested movie index differs from total. Saves request timing, asserts packed size nonzero, advances producer and movie index, conditionally wraps for looping, and sets pending. Does not inspect the request return value. Returns OSRestoreInterrupts result rather than a submission-success flag.

## fn_8001F294

Returns MoviePlayer.unk_110 unchanged. Shutdown polls this accessor. A local MWERKS pragma requests no inlining and a todo comment discusses interrupt visibility, but the body does not yield or wait; source alone does not prove compiler or runtime synchronization guarantees.

## fn_8001F2A4

Ignores alarm/context arguments and maps global tick counter through optional count/duration pairs. If the current consumer frame equals the scheduled frame, increments the counter and tests equality with total frame count. That equality resets the counter for looping or rolls it back and sets completion otherwise. If the resulting scheduled frame differs, calls one-step advancement once. There is no power or render-enable guard, no greater-than end check and no rate-table bounds validation.

## lbMthp_8001F410

Asserts power is zero and sets it to one before initialization. Retains the rate-table pointer, calculates memory, asserts caller-buffer capacity or allocates and records internal ownership, sets loop mode, partitions/preloads buffers, clears completion and enables rendering. Creates an alarm and passes OSSecondsToTicks(1.0f/60) as both start and period arguments. No local allocation-failure recovery, buffer alignment check, rate-table validation or automatic rollback appears.

## lbMthp_8001F578

With interrupts disabled, snapshots consumer index unk_88 into decode selection unk_90, movie frame unk_78 into unk_7C and timeline counter unk_80 into unk_84. Restores prior interrupt state; performs no decode, playback advance or power check.

## lbMthp_8001F5C4

Returns the integer conversion of the last snapshot unk_84 without synchronization or validation. The value changes on snapshot updates and need not equal the compressed frame index when a rate table is used. No nonnegative-range guarantee is enforced.

## lbMthp_8001F5D4

Returns unk_134 as u32, the saved tick difference written by the completion callback. Initialization clears it. The accessor neither measures time nor synchronizes the read.

## lbMthp_8001F5E4

Returns current signed available-buffer bookkeeping unk_108 unchanged. Preload initializes capacity minus one, callbacks increment it, and allowed consumer advancement decrements it. The getter does not reset or synchronize it.

## lbMthp_8001F5F4

Returns signed minimum-buffer bookkeeping unk_10C unchanged. Preload initializes capacity minus one; the advance helper lowers it when current count is smaller, including a failed advance guard. Getter does not reset or synchronize it.

## lbMthp_8001F604

Returns stored completion flag unk_144 unchanged. Startup clears it; the alarm sets it when the next scheduled frame equals total in nonloop mode. Stop and power reset do not clear it, so it can remain one while inactive.

## lbMthp_8001F614

Stores the supplied integer unchanged into unk_148. Draw tests zero versus nonzero after calling the decoder, so disabling rendering does not stop decode attempts, asynchronous refill or alarm progression.

## lbMthp_8001F624

Clears the shared image descriptor pointer, assigns caller dimensions to its fields, calls HSD_SObjLib_803A477C with gobj, the shared SObj descriptor, zero, zero, 0x80 and zero, sets bit 0x10 on the returned SObj and returns it. It does not guard a null constructor result. Constructor layout and renderer flag semantics are delegated.

## lbMthp_8001F67C

Always calls the decode helper. If render-enable is nonzero, initializes one full-size and two half-dimension output-buffer textures as I8 with clamp and nearest filtering, loads texture maps zero, one and two, and calls HSD_SObjLib_803A49E0 with unchanged callback arguments. Zero render-enable suppresses GX and draw calls but not decoding/refill. No power guard appears.

## lbMthp_8001F800

When power is nonzero, clears request gate unk_70, busy-polls pending until zero, cancels the alarm, calls HSD_VIWaitXFBFlush, frees only nonnull owned buffer unk_140 and clears power last. An inactive call is a no-op. It does not clear completion, owned pointer or other state, cancel an in-flight request, impose a timeout or explicitly yield inside the polling loop.

## lbMthp_8001F87C

Unconditionally writes power zero only. Does not cancel alarms, wait for requests, release owned memory or reset completion and indices. It cannot safely replace full shutdown for an active player.

## lbMthp_GetFrame

Maps null rate-table pointer to counter directly. Otherwise walks unbounded pairs of frame count and ticks per frame, subtracting count*duration until counter is below the product, then adds counter/duration. No terminator, length, overflow or denominator validation. Invalid or exhausted tables can walk outside storage; zero-product entries advance without consuming counter.

## lbMthp_GetPlayer

Returns addresses of singleton and its retained rate-table pointer.

## lbMthp_GetDecoder

Identity pointer adapter.

## Evidence Limits

Gameplay callers, physical section layout, decoder/SObj internals and compiler/runtime interrupt guarantees remain unresolved. Header render reports collisions with lb_01F8 aliases; only owned aliases are proposed for clearing. No source, shared knowledge, matching, compilation, publication or UI changes were performed.

Review correction: callback state fact65617fad is unresolved because producer compares against selected decode snapshot unk_90, not live consumer unk_88. Counts:48 retain,54 supersede,47 unresolved,2 clear.
