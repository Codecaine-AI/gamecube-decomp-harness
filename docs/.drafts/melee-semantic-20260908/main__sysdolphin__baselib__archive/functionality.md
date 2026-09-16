# HSD Archive Parsing and Symbol Binding

The TU maps a loaded mutable archive image into an HSD_Archive descriptor, relocates internal references in place, finds named public payloads, enumerates external names, and binds external slot chains. It performs no file I/O or allocation. Its four canonical exports and private Locate helper are reviewed completely.

## Parsing and Internal Relocation

HSD_ArchiveParse rejects a null output descriptor before writing. Otherwise it clears the 0x44 descriptor, sets flag bit one, and copies the 0x20 serialized header. The owned header names this bit HSD_ARCHIVE_DONT_FREE. A declared file-size mismatch emits the diagnostic and returns -1 after those descriptor writes. The message calls this a byte-order mismatch, but the code only compares sizes; it does not detect or convert byte order. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L18-L35 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.h#L8-L19.

For matching sizes it maps nonempty data, relocation, public and external regions consecutively after the header. A remaining tail becomes the symbol table. It retains src as top_ptr and calls Locate. That helper adds the data base to each 32-bit word selected by relocation offsets. Thus parsing changes the supplied archive bytes and is not guaranteed safe to repeat on an already relocated image. Success returns zero. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L7-L16 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L37-L68.

Only the declared total size is checked. There are no comprehensive bounds checks for section counts, table arithmetic, relocation offsets or string terminators, and src is not checked for NULL before memcpy. Zero-count sections retain the NULL pointers established by memset. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L18-L68.

## Lookups and External Binding

HSD_ArchiveGetPublicAddress performs a first-match strcmp search. It returns data plus the public entry offset or NULL after exhausting the table. It leaves the archive unchanged and does not establish a payload type. HSD_ArchiveGetExtern treats its parameter named offset as a signed entry index, returning NULL for negative or out-of-range values and otherwise returning symbols plus that entry's string offset. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L70-L94.

HSD_ArchiveLocateExtern selects the first exact matching external name. Its entry offset starts a chain whose current word holds the next byte offset. Each iteration saves next before replacing the word with the supplied runtime address. It stops at UINT_MAX or an offset at least data_size, returns no status, and may have changed earlier slots before stopping. It does not ensure an entire pointer-sized word fits, detect cycles, or make repeated binding safe after chain words have been overwritten. Missing names or initially terminated/out-of-range chains do nothing. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L96-L122.

## Owned Header and Data

HSD_ArchiveHeader contains total size, data size, three counts, four version bytes, and two padding words; ASSERT_SIZE fixes it at 0x20. Relocation records contain one u32 offset. Public and external records each contain a u32 data/chain offset and u32 symbol-table offset. HSD_Archive contains the copied header, five mapped region pointers, next, name, flags and top_ptr; ASSERT_SIZE fixes it at 0x44. The header declares all four exports and contains no inline implementation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.h#L10-L52.

The sole .data target is a 71-byte null-terminated diagnostic string plus one linked padding byte. Existing source and split objects identify the string and its two code relocations inside Parse. The frozen-hash report records 72 matched data bytes. compiled-evidence.json records paths, hashes, bytes and relocations. No compilation or matching ran.

## Review Boundaries

All 123 source lines and 55 header lines were read in canonical and rendered form. Source rendering has zero parse errors; header rendering has six. Both returned complete text, no substitutions and EOF. Canonical names remain authoritative and no naming hypotheses existed.

The sibling lbarchive review independently reports a separate relocation path that accepts an additive base and leaves top_ptr zero. That cross-TU comparison remains with its owner; this proposal makes no claims about lbarchive implementation or specific payload types. Caller-specific asset examples in the inherited public-lookup game mapping were narrowed to generic resource lookup. Foreign type ownership is unchanged.

## TU Lead Verification

Complete canonical and rendered source reviewed. Checked descriptor-before-validation writes, in-place relocation, first-match lookup and bounded-start chain traversal. Header parser errors 6; all text available. See [lead verification](lead-verification.json). Independent review and KB application remain pending. Canonical and rendered snapshots are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__archive/pages/`.

## Current Application Status

Root completed reviewed live KB promotion for 27 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__archive/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__archive/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/ffcfd54eee2c8f77ce87a5e6ffc73e4c61c6f797080f4edcf77437b37a92658a/2026-09-08T14-47-53.849Z-2cee8551-3aae-4896-8d72-edfe978b78b0.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__archive/final-render.json).
