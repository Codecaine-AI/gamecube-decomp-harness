# Memory-Card Checksum

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical/rendered C1-38 and H1-9 reviewed to EOF. Research started 2026-09-08T14:55:13.170Z; completed 2026-09-08T14:56:37.986313+00:00.

## Algorithm

hsd_803B2B20 initializes local bytes to 01 23 45 67 89 AB CD EF FE DC BA 98 76 54 32 10. For positive len, it adds each source byte modulo 256 into lane i modulo 16. It then processes lanes 1 through 15 left to right, XORing the current byte with 0xFF if it equals the previous finalized byte. Finally it copies all 16 bytes to dest.

The previous lane may already have been inverted, so comparisons use finalized values. Adjacent output bytes therefore differ. For len zero or negative, the read loop is skipped and the seed remains unchanged. Output is always 16 bytes, and valid writable destination storage is still required. Source bytes are read before any destination write. The function has no allocation, persistent state, I/O or input-length validation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B2B.c#L4-L37.

## Interface

The actual declaration is void hsd_803B2B20(u8* src, int len, void* dest). Source bytes are read-only in use, but the declaration does not carry const. The inherited effective signature used the inferred alias and changed types; its replacement preserves the actual declaration and documents the fixed output separately.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B2B.h#L6-L6 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B2B.c#L4-L37.

## Card Consumers

hsd_803B2FA0 writes the checksum for bytes after the first 16 into that prefix before transforming the payload bytes. hsd_803B31CC performs its reverse byte-processing loop, recalculates into a local 16-byte buffer and compares it with the stored prefix, returning -1 on mismatch.

The card-state code computes block digests, stores them at 16-byte offsets, and appends the digest table to the final payload. Its independently read write helpers invoke CARDWrite. These concrete consumers support the inherited memory-card checksum meaning without relying on archived Discord assertions or claiming the full neighboring encoding algorithm.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B2E.c#L66-L82, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B2E.c#L145-L176, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4623-L4635, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4666-L4674 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.c#L4435-L4468.

## Coverage

One function target, the TU entity and all three parameter entities are covered. The parameter entities have no baseline facts. No section targets exist in the manifest. Every existing fact has an explicit ID/timestamp-hash version and disposition in coverage.json. No source, shared-KB or neighboring TU edits were made.

## TU Lead Verification

Complete canonical and rendered C/header reviewed and every proposed slot scanned. Checked local seed, modulo-256 lane accumulation, sequential adjacent-byte correction, nonpositive input length and final fixed-size copy. Qualified source preservation when output aliases it. Foreign CARD/checksum consumers remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

Reviewed live application: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/1ea7e2810726f693451c3100af511d8241b555f5d0612a79589aae8bcc2d04dc/2026-09-08T15-07-34.304Z-35116fdb-c2b6-4eb9-96ce-201cdd2b914e.receipt.json); [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B2B/final-render.json).
