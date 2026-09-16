# hsd_3B5C functionality review

Draft pinned to c302741689bd67c361cd7faadb221df3193992c3. Owned C1-912 canonical/rendered is covered through EOF, including all constant-table lines;911 lines exclude the trailing empty line. Shared hsd_3B34.h, encoder, snapshot caller and workspace are foreign evidence. No asset inspection, source changes, build, publication or shared-KB writes. Independent review is pending.

## Codec scope and storage

This is the snapshot image decoder. It uses JPEG markers, fixed JPEG-derived codebooks, two quantizers,4:2:0 component layout and inverse-DCT reconstruction, but its AC grammar is custom. It is not a general baseline-JPEG validation or compatibility implementation. The paired encoder confirms that a nonzero AC value writes a run-length category, a payload encoding run+1, then a separate magnitude category and payload. The decoder consumes that same sequence; it does not unpack a conventional combined run/size symbol.

The foreign2084-byte workspace begins with a248-byte __jmp_buf,32 bytes of unspecified state, and a JpegWorkData at0x118. Work contains256 luma,64 Cb,64 Cr,64 coefficient s32 values and three DC predictors at0x818. The source pointer/base/size, cached byte/bit count and quantization tables are also shared. No context parameter, locking or save/restore mechanism supports concurrent or nested decodes.

The .data section is0x630 bytes. Its0x5A8 aggregate begins with two64-byte writable quantizers and DC symbols at0x80. Luma AC code/length/value regions begin at0x8C/0x1D0/0x274; chroma equivalents at0x3BC/0x318/0x500. The aggregate is followed by the64-byte zigzag map, two12-entry u16 DC-code tables and two12-entry u8 DC-length tables. The function uses the fixed codebooks; it does not build them from DHT markers. Source and object table bytes were inspected, including all64 zigzag values and all DC tables. Exported tables also serve the foreign encoder.

## Entropy bits and symbols

hsd_803B5C4C forwards to an inline do/while reader. It consumes cached MSB-first bits and refills when count is zero. Refill sets count8, checks the current pointer, loads the byte and advances. For FF, the follower is dereferenced before its bound is checked. A nonzero follower triggers longjmp; a zero follower is checked and consumed. Terminal FF can therefore read past declared input before recovery. Existing assembly confirms this order.

The bit count is not validated. Zero or negative input still consumes a first bit and decrements; there is no zero-bit fast return. Large counts can overflow signed accumulation. Normal use requires positive representable widths and a live decoder recovery context. Restart markers are not handled as valid entropy-stream controls.

hsd_803B5D70 chooses DC when ac=0 and AC otherwise, with component0 selecting luma and other selectors selecting chroma. Starting with code0 and length1, it appends bits and walks code/length/value entries. Matches return the byte symbol. Progress beyond length16 returns0, which is also a legitimate decoded symbol. There is no table-entry count check, so exhausted tables can be read beyond their declared entries before the length fallback. Fixed valid streams are assumed.

hsd_803B5EA0 selects one of three DC predictors without checking the index. A positive DC category consumes payload bits and performs JPEG-style negative extension; category0 supplies delta0. The updated predictor becomes coeff0. AC starts at scan index1. A zero run-category clears all remaining coefficients and ends the block. A nonzero category consumes that many bits, subtracts1 into u32 zeros and writes that many zeros through the zigzag map. A second AC symbol specifies magnitude width, followed by signed payload and the next coefficient.

There is no remaining-block check inside the zero-fill loop. Payload0 underflows the unsigned run count, excessive runs index beyond the map, and magnitude width0 reaches the do/while bit reader and a width-1 shift. These are concrete implementation constraints; valid custom streams avoid them.

## Inverse transform and pixel layout

fn_803B61B4 transforms a64-s32 block in place. Eight contiguous rows use cosine-weighted f64 products, f32 intermediates and s32 output casts. Eight strided columns repeat the transform. Every final sample is arithmetic-shifted right2. The intermediate integer truncation matters: this is not one floating-point transform with only final rounding. No input-length or numeric range check exists.

fn_803B6820 first adds128 in place to all256 luma values. Repeating it without fresh reconstructed samples would add the bias again. It maps four8x8 luma blocks and one8x8 Cb/Cr block across a complete16x16 region, sharing chroma per2x2 pixels. The color equations are:

- R=Y+1.402Cr.
- G=Y-0.3441Cb-0.7139Cr.
- B=Y+1.7718Cb-0.0012Cr.

The actual source mixes f32 and f64 evaluations explicitly. Values below0 become0, values above255 become255, and in-range finite values truncate to integer. Pixels pack as5/6/5 bits into u16 output. Four-by-four tiles determine storage order. Width rounds upward to a multiple of16 for stride, and the supplied height is unused. It always writes256 pixels; there is no clipping or destination-capacity parameter.

For positive image dimensions the caller needs2*round_up(width,16)*round_up(height,16) bytes. The top-level return is only width*height*2. For example,17x17 returns578 but writes within2048 bytes of padded storage. The known snapshot producer uses640x480, where padded and nominal sizes both equal614400. This arithmetic is recorded in output-layout-analysis.json; no decoder execution was performed.

## Marker sequence, reconstruction and recovery

hsd_803B6BE4 installs the shared source/base/size, clears all three predictors and cached-bit count, then establishes __setjmp. It searches bytewise for two FFDB markers, FFC0 and FFDA in that order. The marker u16 load occurs before checking whether advancing reached the declared end. After a DQT match it skips5 bytes and copies64 payload bytes through the zigzag map, without validating segment length, table identifier, precision or remaining bytes. Two separately found quantizer markers are assumed.

The frame path skips5 bytes, reads u16 height and width and advances a fixed amount. The scan path skips14 bytes from its marker. Frame/scan fields, sampling factors, component identifiers, DHT data, restart state and final EOI are not validated. The supplied size therefore supports selected failure checks, not comprehensive bounded parsing.

Loops step y/x by16 while below nominal dimensions. Each region decodes four luma blocks with quantizer0, one Cb and one Cr with quantizer1. Each coefficient block is multiplied by its8-bit quantizer, inverse-transformed and then passed to pixel output. The scratch coefficient pointer is reused for Cb and Cr. The return is nominal width*height*2, with possible signed overflow for sufficiently large u16 dimensions.

Explicit longjmp paths return0. They do not undo quantizer changes, bit/input state, work samples or prior pixel writes. Partial output can remain. Width or height0 also produces nominal0 without entering normal pixel loops, so0 is not exclusively a proof of a detected parse error.

lbSnap_8001DE8C calls the decoder only in snapshot state4, flushes the requested snapshot-sized destination range even if decode returns0, and reports success for a nonzero decoder result. That caller grounds the Camera Mode mapping; no UI execution or end-to-end display claim is made.

## Numeric and exception sections

.sdata2 is112 bytes: eight f64 transform constants, a compiler integer-conversion bias, f64 red/blue-correction literals, f32 clamp/color constants and padding. Both existing object records agree on the section bytes. This is a literal pool, not a single authored transform table.

extab contains four8-byte records, with first words18080000/30080000/28080000/48080000 and zero second words. extabindex contains four12-byte function/length/extab-reference entries for5C4C/5D70/5EA0/6BE4, with lengths0x124/0x130/0x314/0x64C. There are no entries here for the inverse-DCT or pixel converter. These are compiler/runtime exception records. They are distinct from the explicit __setjmp/longjmp buffer and are not codec payloads. Existing object and assembly hashes are recorded; no build freshness or overall binary-parity claim is made.

## Naming and disposition

All10 targets,24 subjects,49 old facts and19 exact baseline outgoing links are covered. Facts:27 retain,22 supersede,13 new parameter roles. Eighteen relationships retain support from canonical evidence. One exact relationship is unresolved: its rationale attributes an identification to a specific Discord message that was not verified. Objects, assembly and runtime registration support exception-index metadata, but do not verify the historical attribution.

Retain three descriptive hypotheses: HSD_JPEGReadBits, HSD_JpegDecodeHuffmanSymbol and HSD_JpegDecodeDCTBlock. Each has one exact baseline assignment and no pinned canonical source occurrence. No new aliases, cosmetic case normalization or historical spelling claims. The other functions and sections retain canonical names.

Five rendered pages report zero parser errors and substitutions0/9/0/0/3. Inline helpers without target identities and shadowed cb bindings remain canonical. Dry-run validates62 operations with zero rejected/skipped. Family followups retain codec/edge-storage/shared-state constraints and foreign ownership; no source fixes are included.

See [proposal.json](proposal.json), [fact-dispositions.json](fact-dispositions.json), [link-dispositions.json](link-dispositions.json), [subjects.json](subjects.json), [naming.md](naming.md), [compiled-artifacts.json](compiled-artifacts.json), [foreign-canonical.json](foreign-canonical.json), and [family-followups.json](family-followups.json).

Pinned evidence: [reader/symbols/block](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B5C.c#L161-L334), [IDCT](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B5C.c#L339-L477), [color/tiling](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B5C.c#L479-L619), [setup/quantizers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B5C.c#L660-L774), [frame/MCUs](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B5C.c#L775-L895), [shared tables](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B5C.c#L897-L911).

Immutable canonical/rendered snapshots:

- [src__sysdolphin__baselib__hsd_3B5C.c.1-180.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B5C/pages/src__sysdolphin__baselib__hsd_3B5C.c.1-180.json)
- [src__sysdolphin__baselib__hsd_3B5C.c.181-380.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B5C/pages/src__sysdolphin__baselib__hsd_3B5C.c.181-380.json)
- [src__sysdolphin__baselib__hsd_3B5C.c.381-580.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B5C/pages/src__sysdolphin__baselib__hsd_3B5C.c.381-580.json)
- [src__sysdolphin__baselib__hsd_3B5C.c.781-912.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B5C/pages/src__sysdolphin__baselib__hsd_3B5C.c.781-912.json)
- [src__sysdolphin__baselib__hsd_3B5C.c.581-780.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B5C/pages/src__sysdolphin__baselib__hsd_3B5C.c.581-780.json)
