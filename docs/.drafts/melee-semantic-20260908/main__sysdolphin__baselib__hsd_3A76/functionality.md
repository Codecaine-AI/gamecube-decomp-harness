# SIS Interpretation and Rendering

Draft at c302741689bd67c361cd7faadb221df3193992c3. All 1128 owned C lines were read in canonical and rendered form. No header belongs to this task. Source-view metadata reports one parser error, with M2C_BITWISE at line473 marked uncertain. Canonical source, static helpers and both MUST_MATCH branches were inspected. Immutable paired snapshots are under the assigned unit state's pages directory; coverage.json maps facts to exact canonical citations.

## Typed State Records

HSD_SisLib_803A7684 appends one record selected by flags&0x7F: spacing, RGB, scale, alignment or a 32-bit cursor. Payload precedes full flags. Lengths are 5,4,5,2,5 bytes. Spacing decodes as signed 8.8 and scale as unsigned 8.8. RGB leaves alpha untouched. Capacity grows once by 16, copying the old capacity and zeroing the added region before freeing the old buffer. Capacity and used length are u16, with no wrap checks. Exact fill reserves no spare sentinel byte.

HSD_SisLib_803A7F0C scans backward starting at string_buffer[x6C], rather than the final used byte. It restores the first matching low-seven-bit record even if high bits differ, then stops. Equal high bits also remove that record, compact following bytes and clear its old tail. Type5 returns a cursor bit pattern; other types return zero. Reads assume a spare initial byte, valid record starts and target alignment. Malformed or exact-fill buffers can violate those assumptions.

## Measurement

HSD_SisLib_803A8134 measures a line fragment. Opcodes1,2,3,7 stop it; opcode0 stops unless a saved continuation is found. Pointer jumps and scoped scale/spacing commands affect the walk. Glyphs advance by horizontal scale times32+spacing, reduced by scaled left+right-2 metrics when enabled. Opcode26 uses16+spacing. Height starts at32 times vertical scale and tracks larger glyph heights. Final width subtracts raw current spacing, not scaled spacing, so empty input can return negative width.

The routine restores x80.x/y, x78.x and used stack length. It does not restore x78.y affected by a type1 restore, prior lower-record contents or buffer allocation. Custom metric bytes are read via the SIS field named textures. If no SIS is present, that local pointer is uninitialized; custom glyph measurement with kerning therefore needs valid resource setup. No cursor, operand, glyph-range or cycle validation exists.

## Drawing and Persistent Progress

HSD_SisLib_803A84BC accepts a GObj only on pass 2. NULL GObj overloads the int pass with an HSD_Text pointer for direct 32-bit drawing. Hidden text or absent SIS buffer skips rendering. GObj mode uses the current camera and optionally invokes render_callback after much of GX setup. Direct mode installs screen bounds 640 by480 and leaves custom font pointers NULL. Its MUST_MATCH matrix offsets are preserved as source facts, not runtime-validated behavior.

A nontransparent background emits a full box quad before optional glyph clipping. The interpreter handles reset/restart, newline, indefinite pause, explicit countdowns, jump/call/return, spacing/RGB/scale/alignment scopes, kerning, fitting and half-width space. It redraws processed content while a saved skip count prevents advancing old reveal events. Glyphs and space use the first delay local; newline uses the second. x60 plus pause/countdown gates the next event. Reset commands can move sis_buffer and replace the saved formatting baseline.

The fitting helper compresses overwide lines only when fitting equals 1; otherwise alignment chooses left, center or right. Glyph textures are 32-by32 I4 blocks with 512-byte stride. Codes below 0x4000 use the external built-in atlas and owned default metrics. Higher codes use the SIS field named kerning as image bytes and textures as metric bytes. This contradicts the apparent field names and remains a family type followup.

Clipping trims positions and UVs. Horizontal UV offsets divide by glyph_w before fit factor x88, while the submitted width includes x88. This differs from normalizing by the fitted quad width. Zero/negative geometry and absent custom resources are not guarded. Completely clipped glyphs still advance layout and reveal state.

Exit invalidates HSD state caches, restores selected RGB, scale, spacing, mode fields and stack length, then clears the stack tail. It does not restore actual previous GX state, all text fields or stack allocation.

## Data and Archive Delegates

Existing source/split .data is 1944 bytes with identical raw bytes: two 108-byte switch tables, followed by three 576-byte arrays. Relocations identify the first switch table with measurement and the second with drawing. Character conversion in hsd_3A64 searches 287 paired external/internal codes. Arrays contain 288 pairs with a final zero pair. The third array holds per-glyph metric pairs, not contextual pair kerning. Source/split .sdata2 is 72 identical bytes of floating constants and conversion biases; source ELF includes WRITE while split does not. Exact symbols, hashes and relocations are preserved in compiled-evidence.json.

The load wrapper forwards to lbArchive_LoadArchive, which allocates separate rounded image and descriptor storage, loads the actual file length and initializes the DAT. The free wrapper delegates to lbArchive_80016EFC, which asserts a descriptor and HSD_ARCHIVE_DONT_FREE, frees data-0x20 and then the descriptor. Neither wrapper clears caller references; those guards do not validate image provenance.

The generated sislib_font.inc belongs to main/sysdolphin/baselib/sislib_font. Its path, byte count and hash are recorded as an exclusion. No glyph artwork or generated font source was reviewed here. Shared SIS/HSD_Text declarations remain owned by sislib; no header edits or type renames are proposed.

Lead corrected opcode6 attribution: x90/x92 seed delay locals before interpretation; opcode6 replaces them from stream operands. Archive free-purpose wording now names the two assertions without implying full descriptor/provenance validation.
