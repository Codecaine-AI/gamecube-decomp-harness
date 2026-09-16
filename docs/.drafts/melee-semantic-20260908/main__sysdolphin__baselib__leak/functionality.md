# HSD Leak Diagnostic

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Owned canonical and rendered leak.c lines 1-170 and leak.h lines 1-7 were read to EOF. Started 2026-09-08T15:02:53.252Z; completed 2026-09-08T15:05:39.907006+00:00. Immutable page artifacts and receipts are in `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__leak/`.

## Entry and State

int HSD_Leak_80387DF8(int indent) reports registered allocations with no accepted reference mark. Its descriptor starts with a null table, zero counters/capacity, and x1C equal to -1. A null table prints an uninitialized message and returns zero, the same numeric result used when no leaks are reported. used and peak are printed; capacity controls table bounds. indent is signed but spacing uses unsigned counts without validation. Negative values can cause very large loops; extreme indent + 2 can overflow signed int.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L7-L23, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L43-L86, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.h#L4-L4.

## Marking

The scan starts at the address of lbCommand_803B9840 and advances one 32-bit word to OSGetConsoleSimulatedMemSize() + 0x80000000. This is a linear scan, not recursive traversal from roots. It accepts aligned words with top nibble 8 or C, masks to the low 28 bits, checks the lower bound ((u32)scan_start + 32) & 0x0FFFFFE0 and physical memory ceiling, then restores 0x80000000 and looks 0x20 bytes backward for a header.

The header must start with 0x01234567. Header word 1 must pass the literal test (u32)(reg_idx + 0x10000) != 0xFFFF and be below capacity. The literal test excludes UINT32_MAX under unsigned arithmetic. The matching table entry with bit 0 cleared must equal the header address; bit 0 is then set. The local ctr is calculated and decremented, but the canonical for-loop termination condition uses scan < end.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L65-L70 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L88-L116. The actual command array definition is independently read at code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L7-L11; this TU treats its address as scan storage.

## Reporting

Each marked table entry has bit 0 cleared and is skipped, including a bit already set before this invocation. Unmarked pointers into the registration table and null pointers are skipped. Each remaining entry increments the result once. A magic/index/backlink check selects the ordinary leak format or destroyed-header format. Ordinary reports print header + 0x20 and header words 2 and 3 under nb_reg and mark labels. The code does not require the header's index to equal the current iteration index, only that the indexed table value matches the header. Duplicate registrations are therefore not deduplicated here.

No allocation is freed. The operation changes temporary table bits and emits reports. The final summary prints either the count or no leak detected, followed by done.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L119-L169.

## Sections and Caller

Existing object-evidence.txt identifies .data as the 32-byte descriptor plus longer diagnostic literals. The source object has 519 bytes; the target has 520 with a final zero byte. .sdata holds the space literal at offset 0 and done-newline at offset 4, occupying 11 bytes in the source object and 16 in the target with trailing zeros. Coverage records both object hashes. Their build provenance is unverified. The inert MUST_MATCH order_data helper preserves registration-related strings; it does not implement registration.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L21-L36, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L43-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L165-L166 and object-evidence.txt.

The independently read controller handler invokes this function with indent zero when D-pad Right is newly triggered while X is held, alongside heap/class/object/entity/thread diagnostics. The observed main-loop call to that handler requires DbLevel >= DbLKind_DebugRom. This supports the inherited developer diagnostic mapping without claiming all possible callers are gated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L98-L122 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L295-L300.

## Coverage

All five owned subjects and nine baseline facts are recorded in coverage.json, including exact IDs, timestamp/hash versions, decisions and evidence. HSD_LeakCheck remains an inferred alias. One parameter entity and the .sdata target had no baseline facts. Read completeness is local to the two owned files; foreign evidence ranges do not claim whole-TU ownership.

## TU Lead Verification

Complete canonical/rendered C1–170 and H1–7, plus all seven proposal slots reviewed. Address-of scan boundary, marker lifecycle, heuristic reporting and signed indentation qualification confirmed. [Lead receipt](lead-verification.json). Independent review pending.
