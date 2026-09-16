# ftbosslib Data Review

Replace all seven inherited section facts. Do not apply the seven proposed clears.

The existing cycle source object and split object independently establish all four allocations. The existing report SHA-256 equals the frozen manifest hash and reports 100% matching data for this TU. No compilation or matching command ran.

.data is mixed storage, not solely diagnostic characters. Offsets 0 through 107 contain three assertion strings with padding. Offsets 108 through 135 form a seven-entry switch jump table. All seven R_PPC_ADDR32 relocations target ftBossLib_8015C530 with case-label addends. Source lines 42-50 explain the strings; lines 260-286 explain the table.

.rodata is the 16-byte zero Quaternion initializer, not two double literals. Symbol @302 spans all 16 zero bytes. Its text relocations occur inside ftBossLib_8015C09C; instructions at text offsets 0x3a0-0x3c0 copy four words into stack storage. Source lines 117-125 declare Quaternion quat = { 0 } and overwrite Y before HSD_JObjSetRotation.

.sdata holds jobj.h and jobj assertion strings. It is 13 bytes in the source object and 16 bytes including linked alignment padding in the split object. Relocations at text offsets 0x3e2, 0x3ea, 0x42a, and 0x432 refer to those two strings within ftBossLib_8015C09C. The foreign jobj.h lines 274-281 independently show the inline assertion and rotation copy. Neither scalar-numeric inherited interpretation survives the bytes.

.sdata2 has no inherited facts. Its 48 linked bytes contain mixed float/double numeric literals and alignment padding, including zero, the integer-conversion bias, 0.5, 3.0, pi/2, and -1.0f. No new fact is required for this review.

All seven fact IDs, updated_at versions, dispositions, object hashes, exact byte layouts, source ranges actually inspected, and read exceptions are in data-review-evidence.json. data-review-proposal.json contains seven replacement writes pending independent promotion review. No source, shared KB, Git, UI, or build state was modified.
