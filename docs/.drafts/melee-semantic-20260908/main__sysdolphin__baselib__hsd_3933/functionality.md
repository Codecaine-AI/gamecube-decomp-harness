# Deferred MCC Commands and Host File Output

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Owned canonical/rendered C1-367 and H1-16 were read to EOF. C has three parser errors with no substitutions; header has zero errors and two substitutions. Started 2026-09-08T15:13:04.972Z; completed 2026-09-08T15:18:01.835855+00:00. Immutable page receipts live in `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3933/`.

## Callback and Handshake

fn_803932D0 queues type/flags/value only when flags equals 0x100 and the pending-count snapshot is at most 256. Count 256 overwrites the head slot and becomes 257. The consumer dequeues under an explicit interrupt disable/restore pair; the enqueue body has no such guard. It later requires type 15, so the producer's acceptance is broader than the consumer's protocol domain.

hsd_80393328 returns zero immediately if query-busy is set. Otherwise it sets busy, takes HSD_Rand modulo 255 and sends 0x100 plus that token. Independently read HSD_Rand yields 0..65535, so token zero is possible. The do-loop pumps the companion service before testing token zero. A zero initial token can therefore produce success without a received acknowledgement, including after notification failure. A matching 0x200 message also clears the token. Busy is cleared on normal success and timeout; timeout does not reset the token.

The tick test runs only after each service call, which may recurse and block. Three seconds is a polling threshold, not a strict wall-clock upper bound. Token zero wins before timeout. The companion REBOOT path uses this return to restart or discard the event.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L47-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L259-L267, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/random.c#L3-L10, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L239-L251.

## Packet Dispatch and Channel Commands

hsd_80393844 consumes only records with flags 0x100 and type 15. Values 0x100..0x1FF cause an acknowledgement with tag 0x200; values 0x200..0x2FF can clear the matching token. Values 0x80..0xFF select an incoming request slot 0..127. It clears request scratch, reads 32 bytes at slot<<5, rejects a set x4_b7 flag, prepares response scratch with that flag set and copies the request ID and byte-5 command. Dispatch requires command <32 and a non-null pointer. Command byte 0 calls hsd_80393440. Byte 1 calls the empty hsd_80393840. Remaining slots are null. The dispatcher does not automatically send a response, and the no-op's invocation still follows common scratch writes and dequeue work.

hsd_80393440 reads the halfword at offset 6, distinct from the byte-5 dispatch command. Subcommand family 0x100 requests allocation; 0x200 requests release. Allocation searches flags 2..15, takes block demand from the low nibble and streaming mode from bit 0x80. No channel gives 0x8001; insufficient free blocks gives 0x8010 plus free count. Success marks a local flag and sends the channel number before attempting MCCOpen or MCCStreamOpen. Zero blocks pass the local capacity comparison but the independently read MCCOpen rejects zero.

Release accepts any low-nibble index with flag exactly one, including reserved channels. It sends zero, advances the response slot, clears the flag and calls MCCClose. An invalid flag gives 0x8002. Both families write response packets at 0x1000 + slot*32 and notify 0x80+slot, then advance modulo 128. Write results and open/close results are ignored; notify failure only logs. A positive reply and local allocation flag therefore do not prove transport success. Unknown subcommand families do nothing.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L99-L204, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L222-L289 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mcc/mcc.c#L894-L950.

## Readiness, Level and File Output

hsd_80393A04 rejects a clear imported FIO flag without querying, clears it after FIOQuery failure and returns true only after query success. Independently read FIOQuery sends a peer notification and, on failure, waits through an additional five-second tick loop before returning zero. This predicate can block. hsd_80393A54 simply stores its integer level; this TU does not read it. Startup uses level one before the USB-server wait, and the companion initializer also sets it.

hsd_80393A5C repeats the readiness check, returning -5 if unavailable. It skips one leading slash by moving the local filename pointer, without modifying path bytes. It opens with mode 0xA02 and recognizes descriptor -1. A successful open is followed by one FIOFwrite call and a FIOFclose call on either result branch; it ignores close success and does not retry a short write.

The u32 write result is converted to f32 and compared with signed size converted to f32. Above 2^24, distinct integers can compare equal. FIOFwrite returns UINT32_MAX on failure, which rounds to 2^32 as f32; casting that to s32 is outside the representable domain. The wrapper therefore does not guarantee exact written-count or -1 error propagation. On float equality it returns requested size and reports elapsed seconds and 8*size/elapsed/1024. No zero-elapsed guard exists. OSSecondsToTicks receives 1.0F, so the division is floating point.

The independently read screenshot adapter strips USB: and passes a numbered shot/screenshot%02d.frb path, the last completed XFB buffer, and fbWidth*xfbHeight*2 bytes. This establishes a concrete raw-framebuffer export use without broad claims about other file operations.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L291-L365, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mcc/fio.c#L162-L225, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mcc/fio.c#L302-L338, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os.h#L77-L84, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbscreenshot.c#L64-L98 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L174-L182.

## Sections and Representation

Existing .bss is 0xCA8 bytes: 256 three-word records at offset zero, followed by the 42-word hsd_804CF740 object at +0xC00. Flags occupy its first 16 words; response scratch is addressed at +0xC40 and request scratch at +0xC80 relative to the event base. The canonical expressions exceed the declared event-array bounds. Existing object symbols explain intended placement without proving portable C indexing.

.data is 0x1E0 bytes with notification-error text at zero, the 32-entry handler table at +0x1C, another MCC-error format at +0x9C, and the aligned 0x130-byte message object at +0xB0. Only three message fields are read by the owned file writer. Retained loading/directory strings do not establish those implementations in this TU. .sbss has seven integer words, 0x1C source bytes and 0x20 target bytes with trailing padding. The FIO flag belongs to the companion TU. .sdata2 has floats 8 and 1/1024 plus unsigned/signed conversion-bias doubles.

Existing object hashes and dumps are saved without asserting pinned build parity. Shared-layout and callback-type repairs remain family work. The historical particle label and two function aliases remain hypotheses.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L10-L45, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L99-L104, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L206-L229, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L269-L283 and object-evidence.txt.

## Coverage

All 22 subjects and 52 baseline facts have explicit timestamp/hash-versioned dispositions in coverage.json. Nine parameter entities and .bss/.sbss/.sdata2 were fact-free. No source or shared-KB changes occurred.

## TU Lead Verification

Full canonical/rendered C1–367/H1–16 and28facts reviewed. Zero-token query, deferred timeout, unchecked channel operations and FIO float conversion contracts confirmed. [Lead receipt](lead-verification.json), [outgoing links](link-dispositions.json). Independent fact/link review pending.
