## OSFont semantic review
The complete canonical and rendered file covers substantially more than encoding selection: character-to-glyph mapping, ROM loading, compressed-data decoding, sheet expansion, texel copying, texture lookup and width lookup. Existing function names fit their canonical behavior; the renderer reported no substitutions or parse errors.

`OSGetFontEncode` initializes a private static `u16` to `0xFFFF`, returns cached values <= 1 immediately, and otherwise selects Shift-JIS only for NTSC with `VI_DTV_STAT & 2`; all other modes select ANSI. No source path resets this cache. CARD formatting consumes the selection, and CARD ID validation reports an encoding mismatch after its structural and checksum checks.

`ReadROM` reads chunks of at most 256 bytes, retrying each indefinitely until successful. `GetFontSize` checks only the first three bytes for `Yay`; `Decode` follows mask bits, literals and backward references without comprehensive input validation. `GetFontCode` uses half-width/full-width tables and arithmetic Shift-JIS mapping; its range branches are not a general malformed-input validator.

`OSLoadFont` always clears `SheetImage`; only a nonzero decoded-size result replaces `FontData`, `WidthTable` and `CharsInSheet`. A failed reload therefore leaves older metadata pointers while clearing the expanded-sheet state. These globals retain pointers into caller-owned font storage. `OSInitFont` chooses encoding-dependent scratch space, aligns it downward to 32 bytes, loads the font, aligns the sheet destination upward and expands I4 or IA4 data backwards before storing the cache range. Unsupported formats still reach `DCStoreRange` without expansion.

Texel lookup requires loaded but unexpanded data and I4 format, and ORs mapped nibbles into the destination rather than replacing or clearing them. Texture lookup requires expanded sheets and permits a null width output. The three string APIs consume a second byte only for the shown Shift-JIS lead ranges with a nonzero following byte. On a terminator, texture lookup clears only the image output; texel and width lookup leave their outputs unchanged.

Source confirms the authored cache identifier `fontEncode`, but does not establish its compiled correspondence to the `.sdata` target. No compiled section or padding conclusions are made.

Status: synthesized; independent review and live promotion pending.
