# hsd_3A64 functionality review

Draft pinned to c302741689bd67c361cd7faadb221df3193992c3. No source or shared-KB changes, builds, or publication. Independent review is pending. The manifest assigns only the C file; shared sislib headers are foreign dependency evidence.

## Encoded copy and table operations

803A6478 copies glyph pairs and complete recognized control units until an opcode-zero terminator, writes that zero and returns its address. Glyph-leading bytes are at least 0x20. Controls 6,7,8,9,10,14 are five bytes; 12 is four; 5 is three; other nonzero controls are one. There is no capacity, malformed-unit or overlap guard. 803A6530 selects source/destination pointers from one unchecked font/resource table and forwards to the copier. 803A660C scans the destination using the same widths and appends at its zero.

## Mutable text construction and encoding

803A6754 invokes the lower constructor with zero position and a 640x480 box. It allocates a 16-byte private stream descriptor and a 128-byte payload. Effective descriptor words are cursor, buffer base, u32 capacity and u32 entry count. The SisBlock view exposes only the first three words; the alternate sisLib_803A7664_t view exposes four. The owned comment claiming a byte-sized capacity store is stale against current sislib.h. Reset also allocates a separate 16-byte raw string buffer before this wrapper publishes its private SIS command buffer. No local constructor-result check exists.

803A67EC maps selected ASCII punctuation, digits and letters to two-byte lookup keys; other input supplies a two-byte pair. A linear 287-entry lookup emits the corresponding SIS pair only when a key matches. Spaces, periods, digits and colons open the five-byte spacing-state command 0A F4 00 00 00 once. Other classes emit 0B unconditionally, even if the tracked state is already clear. Reaching an input zero closes any open state; reaching the outer index limit of 128 does not. Missing glyph keys leave any emitted controls in the output.

The index limit does not bound output length: glyphs and controls expand input, and fallback may read byte 128 when started at index 127. No output-capacity argument exists. Add/replace each use separate 128-byte formatting and encoded arrays, but vsnprintf receives size_t(-1), equivalent to the large vsprintf limit in the pinned MSL implementation. Dynamic buffer growth happens after these temporary writes and cannot make them safe for arbitrary input.

## Entry layout and mutation

| Offset | Bytes | Meaning |
|---|---|---|
| 0 | 07 | Entry position command |
| 1-4 | Two big-endian s16 values | X/Y position |
| 5-8 | 0C R G B | Color state command |
| 9-13 | 0E Xhi Xlo Yhi Ylo | Scale state command |
| 14 onward | Variable encoded payload | Glyph pairs and spacing controls |
| End of payload | 0F 0D | Restore scale, restore color |

803A6B98 appends this envelope and a stream zero, returning the count before increment. Null format creates an empty entry. Coordinates convert through s16; scale bytes use integer/byte conversions of scale and 256*scale. There are no range or finiteness checks. Growth uses 128*(floor(deficit/128)+1), including an extra block for an exact deficit multiple, copies through the old zero, redirects pointers and frees the old payload.

fn_803A6FEC counts opcode-7 entries by decrementing the index and selecting on a negative result. Nonnegative indices are zero-based; negative indices are not rejected and normally select the first entry. It skips 12 by four, 7/10/14 by five, 11/13/15 by one, and every other nonzero byte by two. This differs from the general copier and assumes the generated-entry grammar. Optional payload sizing begins at offset 14 and recognizes only glyph pairs, five-byte 10 and one-byte 11. Absence returns NULL without changing the size output.

803A70A0 replaces a found entry's payload. Null format makes it empty. Longer text shifts high-to-low and advances the cursor; shorter text shifts low-to-high and retreats the cursor. The shrink loop reads from i+shrink_size for every i below the old tail length, extending beyond the old logical zero by up to shrink_size-1 bytes. No explicit spare-capacity guard protects these extra reads. Found update writes a 0F and returns one; missing entry returns zero. Entry count and prefix metadata are retained under valid grammar/storage.

803A746C updates signed position bytes. 803A74F0 updates RGB only, ignoring alpha. 803A7548 updates the two scale fields; the renderer reads each unsigned 16-bit value divided by 256. 803A75E0 empties a payload through replacement and restores RGB from current text color, preserving the entry slot. 803A7664 clears the entire stream by resetting cursor to base, writing its first zero and clearing count, retaining allocation and stale bytes beyond the new terminator.

The localized character-name path at gm_1601.c833-874 replaces a label and independently applies horizontal and vertical scale. The inspected renderer consumes the encoded spacing, color and scale commands; it is a foreign family dependency, not owned review coverage.

## Constants, aliases and coverage

The two existing objects have a 64-byte .data compiler jump table for fn_803A6FEC opcodes 0-15. Zero relocatable bytes do not mean runtime zero state: existing assembly records sixteen case-label relocations and indirect dispatch through the table. Both .sdata2 sections contain 0.0, 640.0, 480.0 and 256.0 as four floats. Object and assembly hashes are recorded; no build freshness or binary parity claim is made.

Two existing aliases collide: raw copier/table wrapper both use CopyString, and this mutable-buffer creator shares CreateText with its foreign lower constructor. The proposal clears the two wrapper aliases and retains eleven descriptive hypotheses, with no historical-name claim or canonical rename.

Canonical and rendered C1-508 reach EOF. Three pages report zero parse errors and substitutions 3/3/13. Collision entries remained readable under canonical symbols. All 52 subjects, 77 old facts and 13 outgoing links are accounted for. Link relationships remain retained, but the old encoder explanation of guaranteed balanced state is explicitly qualified. Facts: 58 retain,17 supersede,2 reject; 38 new facts cover 36 parameters and two data sections. Dry-run validates 115 operations with no rejection or skip.

See [proposal.json](proposal.json), [fact-dispositions.json](fact-dispositions.json), [link-dispositions.json](link-dispositions.json), [subjects.json](subjects.json), [naming.md](naming.md), [compiled-artifacts.json](compiled-artifacts.json) and [family-followups.json](family-followups.json).

Pinned evidence: [copy/create](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A64.c#L15-L103), [encoder](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A64.c#L105-L219), [add/find](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A64.c#L221-L350), [edit/clear](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A64.c#L352-L507).

Immutable canonical/rendered page snapshots:

- [src__sysdolphin__baselib__hsd_3A64.c.1-180.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3A64/pages/src__sysdolphin__baselib__hsd_3A64.c.1-180.json)
- [src__sysdolphin__baselib__hsd_3A64.c.181-350.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3A64/pages/src__sysdolphin__baselib__hsd_3A64.c.181-350.json)
- [src__sysdolphin__baselib__hsd_3A64.c.351-508.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3A64/pages/src__sysdolphin__baselib__hsd_3A64.c.351-508.json)
