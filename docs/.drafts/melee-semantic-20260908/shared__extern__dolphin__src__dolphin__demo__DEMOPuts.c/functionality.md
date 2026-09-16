## DEMOPuts.c

Provides bitmap-caption and OS ROM-font drawing through GX, plus formatting, measurement, and diagnostic helpers. Canonical and rendered source agree: the renderer reports no substitutions or parse errors. There are no owned baseline subjects, facts, or links to revise or retain; no knowledge changes are proposed.

### Bitmap captions
`DEMOSetFontType` selects three numeric blend configurations, with unknown attributes taking the opaque/default branch. `DEMOLoadFont` loads the external `DEMOFontBitmap` as a 64×96 texture and configures texture-coordinate scaling; filter value zero changes both LOD parameters and `fontShift`. Screen-space setup installs an orthographic projection and identity position matrix; caption initialization additionally configures GX state and loads the font. These routines change GX state without restoring it. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/demo/DEMOPuts.c#L24-L79)

`DEMOPuts` batches runs of bytes 0x20–0x7F, inclusive, into 8×8 character quads. Newline advances y by eight while retaining the original x origin; any other out-of-range byte terminates drawing after flushing the current run. `DEMOPrintf` uses unbounded `vsprintf` into a 256-byte local buffer before drawing. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/demo/DEMOPuts.c#L81-L142)

### ROM-font state and drawing
`DEMOInitROMFont` allocates from `__OSCurrHeap`: 0x120F00 bytes when `OSGetFontEncode()` equals 1, otherwise 0x20120. Allocation and initialization failures call `OSPanic`. The allocation remains referenced by static `FontData` and is returned to the caller; this file provides no release path or guard against repeated initialization. Size and spacing are stored in signed 16-bit fields scaled by sixteen, initially cell width times sixteen and −16. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/demo/DEMOPuts.c#L144-L164)

`DrawFontChar` emits a cell-sized texture quad with position dimensions derived from the font size and cell aspect ratio. `LoadSheet` suppresses consecutive loads of the same image pointer, configuring texture dimensions and format from `FontData`. Both ROM puts entry points reset `LastSheet`, so the cache does not intentionally suppress the first sheet load across calls. Glyph decoding and sheet storage come from external OS font services; their implementation and lifetime guarantees are not established here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/demo/DEMOPuts.c#L166-L217)

`DEMORFPuts` scales coordinates by sixteen, handles newline by resetting accumulated width and adding the font's unscaled leading times sixteen, and advances by scaled glyph width plus spacing. It returns `(width + 15) / 16` for the final line, not the maximum line width. Signed narrowing and negative spacing mean this expression should not be described as unconditional mathematical ceiling. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/demo/DEMOPuts.c#L204-L237)

`DEMORFPutsEx` adds a byte-address endpoint and pre-glyph wrapping when the next advance exceeds the scaled maximum width. An oversized glyph still draws after one wrap; this is not clipping. The loop tests `*string` before the endpoint comparison, and the endpoint is not passed to the OS decoder, so it is not proof of bounded decoding. Coordinates and maximum width remain signed 16-bit variables during scaling. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/demo/DEMOPuts.c#L239-L279)

`DEMORFPrintf` also formats into a 256-byte buffer with `vsprintf`; despite its `int` signature, the canonical body contains neither an explicit return nor `va_end`. `DEMODumpROMFont` selects scratch space within the font allocation using encoding-dependent offsets, aligns the address down to 32 bytes, reloads font data, obtains and reports glyph texels and width, then calls `OSInitFont` again and returns the advanced string pointer. `DEMOGetRFTextWidth` accumulates decoded glyph advances with spacing and has no explicit newline handling. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/demo/DEMOPuts.c#L281-L327)

Numeric GX arguments are preserved without speculative enum interpretation. Source section comments are not treated as compiled layout evidence.

Status: researched; no-change lead bypass; independent review and live promotion pending.
