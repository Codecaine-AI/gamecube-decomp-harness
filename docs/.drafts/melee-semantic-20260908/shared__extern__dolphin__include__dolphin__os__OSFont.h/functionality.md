### OSFont.h
This guarded, C++-compatible SDK header declares the OS font interface. Encoding constants assign ANSI 0u and SJIS 1u; separate macros specify font-buffer size expressions and ROM sizes (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSFont.h#L1-L15).

OSFontHeader declares character-range and metric fields, cell and sheet metadata, widthTable, sheetImage, sheetFullSize, and four u8 fields c0–c3. These are source declarations, not independently verified compiled offsets or pointer/offset interpretations (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSFont.h#L17-L42).

Six declarations cover querying encoding, initializing and loading font data, and obtaining texture, width, or texel information. The signatures expose fontData/temp, string, image, coordinates, width, position and stride parameters without specifying their runtime contracts (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSFont.h#L44-L49).

Canonical and rendered lines 1–56 were fully reviewed; rendering reports zero substitutions and zero parse errors. Existing names match the declared interface; no supported naming correction is indicated. Subject and link enumerations are empty, so there is no baseline knowledge to retain or supersede and no justified proposal.

Status: synthesized; independent review and live promotion pending.
