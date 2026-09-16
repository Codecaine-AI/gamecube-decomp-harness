# Developer Drawing Primitives

Revision `c302741689bd67c361cd7faadb221df3193992c3`. This TU draws immediate GX rectangles/stroke text and software bitmap glyphs. Callback registries, performance statistics and compositor mode/palette state belong to hsd_3924/hsd_392A.

## GX Primitives

DrawRectangle emits one uniform-color quad using signed extents without clipping or state setup. DrawASCII maps digits, both letter cases and eleven punctuation characters to 47 thirteen-byte stroke records. Each byte packs x/y nibbles, pairs form a line, and all current records have an even-offset terminator. Period and colon emit points. Unsupported characters still return the horizontal advance.

Setup stores two scales and a byte-truncated line width, loads the current camera matrix and installs direct position/color state. Point size doubles the stored width then passes through u8 again. It does not restore prior state and does not affect the direct-memory bitmap rasterizers.

String drawing recognizes backslash-c/C and mutates caller color. Its hexval accepts A-F/a-f but ASCII digits map to zero; raw bytes 0-9 take ch-0x30. It has no escape-length guards. Gradient records produce uniform-color bands, not smooth interpolation; each record loads eight bytes before a negative t check and t is not clamped.

Tick drawing derives (-dy/len,-dx/len), so ticks are generally perpendicular only for axis-aligned baselines. Every fifth tick including zero is longer. Loop bound is float count against integer i; length zero, count zero and extreme inputs have no guard.

## Software Glyphs

Default table has four eight-byte color/callback records. The pixel callback writes selected luminance and alternating chroma bytes based on x parity. Bitmap glyphs occupy 56 bytes as fourteen four-byte rows. The nominal rasterizer draws eleven columns; header wording says twelve used pixels and needs separate review. Console callers advance eleven pixels.

Progressive addressing uses y*stride; interlaced addressing uses (y/2)*stride and selects alternate rows. Both clip negative origins partially. Right edge is computed with unsigned x+11 before x clamping: x<-11 can make it equal full framebuffer width and read beyond the glyph. Neither validates pointers, dimensions, stride or callbacks. Interlaced parity is expected 0/1 but is not normalized.

## Data and Ownership

Both objects have .data 7816 bytes: stroke atlas616, callbacks32, bitmap atlas7168. Source .sdata is nine bytes; split has sixteen with padding. .sdata2 is eighty identical numeric bytes with no GXColor or historical duplicate scalar arrays. Source ELF marks WRITE; split constant section does not. Compiled evidence SHA256 `5acbb1aba0babcacfacc0442b0787e6ed3797cba052928ea3cca0a967055b7ab`.

Full C1-552 and header1-27 canonical/rendered reads reached EOF, zero errors and six substitutions per file. Immutable snapshots live under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3915`. Every inherited fact and exact outgoing link has a disposition. Six stale parameter locators and the separately included font asset remain family followups. Object bytes establish atlas extent, not a full glyph-image review.
