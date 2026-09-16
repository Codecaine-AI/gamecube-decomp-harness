# HSD software image encoder

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered C1-1359 and H1-19 read completely. Page snapshots and receipts are in `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B34/pages/`.

## `.data`

Stores the mutable-in-section lookup data used by HSD's JPEG encoder: baseline luminance and chrominance quantization matrices followed by precomputed luminance and chrominance AC Huffman codeword and code-length tables.

The first 64 bytes are luma quantizers and the next 64 chroma quantizers. DQT writes each in the external permutation order after integer division by the scale. The entropy routine selects later AC code/length arrays by component. For each nonzero AC coefficient it indexes once by bit_length(zero_run + 1), writes that code and the zero_run + 1 payload, then indexes again by bit_length(abs(coefficient)) and writes the coefficient payload. It does not form a conventional combined run/category table index.



A 0x450-byte table layout spanning lbl_80430C40[0x40] and lbl_80430C80[0x410]. JpegEncodeTables defines u8 quant_luma[64] at 0, u8 quant_chroma[64] at 0x40, u16 ac_code_luma[162] at 0x80, u8 ac_length_luma[162] at 0x1C4, two padding bytes at 0x266, u16 ac_code_chroma[162] at 0x268, u8 ac_length_chroma[162] at 0x3AC, and two padding bytes at 0x44E. Existing source/target objects both have extent 0x450; their build provenance is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L93-L189, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L433-L442, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L542-L586, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L793-L858, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1203-L1301.

## `.rodata`

Stores the JPEG encoder's fixed metadata aggregate: the null-terminated comment "HAL Laboratory, Inc." and the baseline luminance and chrominance DC and AC Huffman-table definitions inserted into encoded images.

The top-level encoder copies the aggregate at `lbl_803B9670` into stack-local typed buffers. It computes the comment's null-inclusive length and writes it as a JPEG COM payload, then copies the two 0x1C-byte DC definitions and the two 0xB2-byte AC definitions and writes them as four JPEG DHT payloads with table selectors 0x00, 0x01, 0x10, and 0x11.



A 438-byte (`0x1B6`) immutable `JpegMetadata` aggregate, addressable as `u8 raw[0x1B6]` or as a 0x18-byte comment region, two 0x1C-byte DC Huffman definitions, a 0xB2-byte luminance AC definition followed by two padding bytes, and a 0xB2-byte chrominance AC definition.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L25-L92, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1079-L1116.

## `.sdata`

Stores the JPEG encoder's quantization scale. The encoder divides its base luminance and chrominance quantization-table entries by this value both when serializing JPEG DQT segments and when quantizing transformed coefficients, keeping the advertised tables consistent with the coefficient data.

The value begins at 3 and is read by two matching stages of JPEG encoding: the DQT serializer divides each base luminance and chrominance table entry by it, while the block encoder divides each transformed coefficient by the correspondingly scaled table entry. Increasing the value therefore produces smaller quantization steps in both the emitted metadata and coefficient calculation.



A mutable signed 32-bit integer quantization scale with an initial value of 3.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1352-L1358, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L195-L195, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L793-L858, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1203-L1301, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L340-L361.

## `.sdata2`

Stores the JPEG encoder's small read-only constants, including color-conversion coefficients, forward-DCT coefficients, and the five-byte null-terminated `JFIF` identifier used in the APP0 metadata segment.

The encoder loads the section's numeric constants while converting packed source pixels into luminance and chrominance samples and while transforming each 8-by-8 sample block into frequency coefficients. Its trailing JFIF word and one-byte terminator are copied into a local five-byte object, then appended to the bounded output stream as the identifier field of the JPEG APP0 segment.



A small read-only-data constant pool containing compiler-pooled scalar floating-point values followed by the JFIF identifier represented as an aligned four-byte `JFIF` word and a separate one-byte zero terminator, with any remaining bytes serving as section alignment padding.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L238-L429, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L605-L606, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L631-L667.

## `extab`

Provides compiler-generated PowerPC EABI exception and stack-unwinding metadata for functions in this object; it is runtime support metadata rather than part of the unit's JPEG tables or encoded output.

CodeWarrior emits this object's unwind descriptors into .extab; the linker incorporates them alongside the corresponding .extabindex records, and the PowerPC EABI exception runtime uses the indexed metadata when resolving exception or unwind information for compiled code.



A 0x28-byte compiler-generated exception-table fragment in the existing source and target objects. Both mark extab ALLOC, LOAD, READONLY, DATA, with four-byte alignment. It is paired with a 0x3C-byte extabindex fragment. Build provenance against the pinned source is unverified; these bytes are outside the JPEG payload.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L608-L731, code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/__init_cpp_exceptions.c#L1-L39.

## `extabindex`

Provides the PowerPC EABI C++ exception-index metadata associated with this translation unit, referring to its exception-table information rather than contributing data to the JPEG stream.

CodeWarrior's PPCEABI tooling emits and links extabindex entries alongside corresponding extab records. The PowerPC exception runtime's fragment-registration machinery accepts exception-information metadata together with a module TOC pointer and retains both in an active registry slot for later exception processing.



A compiler/linker-generated fragment of the executable's extabindex section, consisting of PowerPC EABI exception-index entries that refer to associated exception-table metadata.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1024-L1349, code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/__init_cpp_exceptions.c#L1-L39, code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/Gecko_ExceptionPPC.c#L1-L41.

## `fn_803B376C`

Performs an in-place, two-dimensional forward discrete cosine transform on one 8-by-8 block of signed integer samples, producing scaled frequency-domain coefficients for the JPEG encoder's quantization stage.

The JPEG encoder's block-preparation routine first fills signed 8-by-8 luminance and chrominance sample arrays in the shared workspace. The encoder passes each block to this function, which overwrites its 64 spatial samples with normalized DCT coefficients through row and column passes. The caller then divides those coefficients by component-specific quantization-table values and passes the quantized results to coefficient entropy encoding.



Static in-place transform with the effective signature `void (s32 block[64])`: the current ABI-facing declaration accepts `u8*`, but the body treats the argument exclusively as a contiguous array of 64 signed 32-bit values representing one 8-by-8 block.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L280-L431, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1191-L1301.

## `hsd_803B3408`

Converts one 16-by-16 region of a tiled RGB565 source image into the JPEG encoder workspace's four 8-by-8 luminance blocks and two 8-by-8 chrominance blocks, preparing the samples for the subsequent DCT, quantization, and entropy-coding stages.

Reads tiled u16 RGB565 using stride ((width + 15) / 16) << 6 and origin (x / 4) * 16 + (y / 4) * stride in u16 units. Expands R/B to multiples of 8 and G to multiples of 4. Writes truncated centered Y = 0.299R + 0.587G + 0.114B - 128 and decimated Cb = 0.5B - 0.1687R - 0.3313G, Cr = 0.5R - 0.4187G - 0.0813B. The work base is the address of hsd_804D2648, overlaid with four s32 luma blocks at 0x118 and one chroma block each at 0x518 and 0x618. The public declaration exposes __jmp_buf; this packet does not independently establish the backing allocation extent. The caller transforms and quantizes the six blocks.

The tile_y/tile_x loops each run twice. Each iteration writes a distributed subset of both chroma blocks, then its luma loop writes 16 positions in each of all four luma blocks through pixel_index * 64. It is not one complete Y block per tile-loop iteration. Chroma uses one decimated source pixel without averaging. Height is ignored; no clipping, edge replication, alignment, null or dimension validation is performed. Callers must provide readable storage for the entire 16-by-16 region.

Void image-block conversion routine with an effective signature equivalent to `void (const u16* image, s32 x, s32 y, s32 width, s32 height)`. `image` is read as packed RGB565 pixels in a 4-by-4 tiled layout; `x` and `y` select a 16-by-16 region in pixel coordinates; `width` determines the tiled row stride; and the accepted `height` argument is not read by this routine.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L203-L278, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L11-L23, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1191-L1301, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A94.h#L85-L94.

## `hsd_803B3CD8`

Entropy-encodes one quantized 8-by-8 JPEG component block: it differentially encodes the block's DC coefficient, encodes the zigzag-ordered AC coefficients and zero runs with component-selected Huffman tables, and appends the resulting bits to the shared bounded output stream.

Uses component 0 luma tables and nonzero component chroma tables, and indexes prev_dc[component] without a range guard. Emits the DC difference category/code and signed payload, then traverses 63 AC coefficients through lbl_80431638. A nonzero AC coefficient emits ac_code[bit_length(run + 1)], payload run + 1, then ac_code[bit_length(abs(coefficient))] and the signed coefficient payload. Negative DC/AC payloads decrement the value before selecting its low bits. Trailing zeros emit ac_code[0]. Bits accumulate MSB-first and completed 0xFF bytes receive a stuffed zero; output exhaustion longjmps. This is the literal two-part AC scheme, not a conventional combined run/category index.

At block start, the routine computes the DC delta from the selected component's predictor and then replaces that predictor with the current DC coefficient. During the 63-entry AC scan it increments a zero-run count for each zero coefficient and resets the count after encoding a nonzero coefficient; if zeros remain at block end, it emits the selected terminating code. Every emitted bit advances the shared bit count, and reaching eight bits flushes one byte and clears the accumulator. A flushed 0xFF is followed by a stuffed 0x00. Any failed capacity guard invokes longjmp through the encoder's saved environment instead of returning normally.

Signature: `void encode_block(s32 component_index)`. The argument is a JPEG component index with the observed domain 0 = luminance, 1 = first chrominance component, and 2 = second chrominance component; it selects the component's DC predictor, while zero selects luminance Huffman tables and nonzero values select chrominance tables.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L448-L599.

## `hsd_803B46D4`

Appends the JPEG JFIF APP0 segment to the encoder's current output stream, supplying the JFIF identifier, version 1.02, pixel-density metadata, and zero-sized thumbnail fields.

Reads the current output cursor from `hsd_804D79A0`, compares each pending write against the end derived from `hsd_804D79A4` and `hsd_804D79A8`, writes an 18-byte APP0/JFIF segment, and advances `hsd_804D79A0` after every successful byte or five-byte block. The five-byte JFIF identifier is assembled in a local word-plus-flexible-byte-tail object and copied with `memcpy`; failed guards consume the shared `hsd_804D2648` jump environment through `longjmp(..., 1)`.

Writes APP0 fields incrementally; any failed guard longjmps with 1 and leaves earlier output committed. Single-byte guards require cursor < end. The five-byte JFIF copy instead requires cursor < end - 5, rejecting an exact five-byte remainder. Emitted metadata is JFIF 1.02, density unit 1, 72 by 72 density, and zero thumbnail dimensions. The stack word plus flexible byte tail is compiler-specific source staging, not a portable bounded C object.

A parameterless `void(void)` JPEG-segment writer. It receives its effective destination, capacity, and error environment through translation-unit globals rather than explicit parameters.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L605-L731.

## `hsd_803B4A2C`

Appends two JPEG Define Quantization Table segments to the active encoder output, emitting table identifiers 0 and 1 and 64 scaled coefficients for each table.

For each table, the function walks the 64-byte permutation map at `lbl_80431638`, uses each map byte to index the corresponding coefficient table at `lbl_80430C40` or `lbl_80430C80`, divides the selected coefficient by the shared divisor `lbl_804D6398`, narrows the quotient to `u8`, and appends it through `hsd_804D79A0`. Header bytes and computed coefficients are written into the buffer beginning at `hsd_804D79A4`, with `hsd_804D79A8` supplying the output capacity.

Before every output byte, the function requires the current cursor to be below `hsd_804D79A4 + hsd_804D79A8`. A successful check advances the cursor by one and stores the byte; a failed check immediately invokes `longjmp` on `hsd_804D2648` with status 1, aborting the current encoder operation.

A `void(void)` JPEG stream-emission routine. It takes no explicit arguments and returns no value; all observable results and error signaling occur through shared encoder globals and `longjmp`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L733-L859.

## `hsd_803B4D64`

Appends a 19-byte JPEG Start of Frame 0 segment to the active encoder stream, recording 8-bit image precision, image height and width, and three component descriptors configured for 4:2:0 sampling with separate luminance and chrominance quantization tables.

Consumes image width and height from its two arguments, converts each to high and low bytes, and appends those bytes with fixed SOF0 metadata through cursor `hsd_804D79A0` into the buffer based at `hsd_804D79A4`. Every successful byte write advances the cursor; `hsd_804D79A8` supplies the capacity bound, and `hsd_804D2648` supplies the jump environment used when the bound is reached.

Before each frame-header byte, the implementation requires the shared output cursor to be below the configured destination end. A successful guard writes one byte and advances the cursor; a failed guard immediately calls `longjmp` with value 1 through the shared encoder environment. Because fields are committed incrementally, a late overflow can leave a partially written SOF0 segment before control resumes at the encoder's setjmp handler.

void hsd_803B4D64(u32 width, u32 height). Serializes the low 16 bits of height then width as big-endian fields without validation. The inline worker receives a jump-buffer parameter but overwrites it with &hsd_804D2648 before use. Destination, cursor and capacity are shared globals.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L861-L1022.

## `hsd_803B51C8`

Runs the software image encoder: emits SOI, JFIF APP0, HAL comment, DQT, four DHT segments, SOF0 and SOS; processes six blocks per 16-by-16 region through conversion, DCT, quantization and entropy encoding; pads a final partial byte and emits EOI. Returns bytes written or zero after output failure. Headers describe baseline JPEG, but the literal AC coding and unstuffed final padding byte require interoperability review before claiming a conforming complete JPEG stream.

The source pointer and dimensions flow into `hsd_803B3408`, which prepares each 16-by-16 image region in the shared JPEG workspace. Four luminance blocks and two chrominance blocks are transformed by `fn_803B376C`, divided by component-specific quantization coefficients, and passed to `hsd_803B3CD8` with component selectors 0, 1, and 2. Header and payload bytes flow through shared cursor `hsd_804D79A0` into the destination beginning at `hsd_804D79A4`, bounded by `hsd_804D79A8`. On completion the function returns the cursor displacement as the encoded size; its snapshot caller stores that size in the shared snapshot record.

Initializes cursor/base/capacity, DC predictors and bit count, but does not explicitly clear hsd_804D79B0[0] at entry. Saves a shared setjmp environment; output failure returns zero and preserves partial output/global state. Full entropy bytes are stuffed by the helper, but the final one-padded partial byte is written directly without a stuffed zero even if it equals 0xFF. It then clears accumulator/count, emits FF D9 and returns cursor displacement. Encoding is non-reentrant and not atomic. Positive dimensions are stepped by 16 without edge clipping; SOF stores only their low 16 bits. Block-copy guards are strict and can reject exact fits.

A synchronous image-encoder routine with current ABI-level signature `s32 (s32 source_address, s32 width, s32 height, char* destination, s32 destination_capacity)`. Semantically, the first argument is a source-pixel pointer and the fourth is a writable byte buffer. A successful call returns the encoded JPEG byte count; buffer exhaustion returns 0 through the function's nonlocal error path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1024-L1349, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L448-L587, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B33.c#L8-L32, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L340-L361.

## `hsd_803B5C2C`

Configures the persistent quantization-quality scale used by HSD's JPEG encoder. It accepts settings from 1 through 10 and substitutes the encoder's default setting of 3 for any value outside that range.

The snapshot-preparation caller writes encoder setting 3 into its snapshot record and passes that value to this function. The function normalizes it and stores it in `lbl_804D6398`. The JPEG encoder subsequently reads that shared value while deriving the luminance and chrominance tables written into DQT segments and while dividing transformed coefficients by the corresponding scaled quantizers.

Each call first writes the requested setting to persistent JPEG encoder state. Values below 1 or above 10 then transition that state to the default value 3; values in the inclusive range 1–10 remain unchanged. The setting persists for later encoder calls and performs no encoding itself.

A void JPEG-quality setter with exact current signature `void (s32 quality)`. Its semantic input domain is the inclusive integer range 1–10; invalid inputs are normalized to the default value 3 before being retained.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1352-L1358, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L793-L858, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1203-L1301, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L340-L361.

## `TU`

Implements a shared-state software image encoder with tiled RGB565 conversion, six 8-by-8 component blocks per region, in-place forward DCT, scaled quantization, Huffman-table-driven coding and JPEG marker serialization. The source emits baseline-style headers but its separate AC run/magnitude scheme and unstuffed final padding byte leave standard decoder interoperability unverified.

The encoder entry point receives a source-pixel address, image width and height, a destination buffer, and destination capacity. It selects shared workspace and initializes output-cursor, entropy, and DC-predictor state; converts each image region into luminance and chrominance blocks; transforms and quantizes their coefficients with component-specific tables; and passes them to entropy coding. Emitted marker and entropy bytes advance hsd_804D79A0 within the destination beginning at hsd_804D79A4; capacity failures transfer through the shared jump environment, while success returns the cursor displacement as the encoded size.

Uses shared output pointers, capacity, DC predictors, bit count, accumulator and jump environment, so calls are non-reentrant. Starts by resetting the predictors and bit count but not explicitly the accumulator byte. Failed output checks longjmp and return zero, with partial output and changed state retained. Success pads any pending bits, directly writes that byte without FF stuffing, emits EOI and returns the byte count. No atomic transaction or general source-buffer validation is implemented.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1024-L1358, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L203-L431, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L448-L599, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B33.c#L8-L32.

## Protocol and storage details

Marker order is SOI, APP0, COM, two DQT, four DHT, SOF0, SOS, entropy data, EOI. APP0 is 18 bytes; each DQT is 69 bytes; SOF0 is 19 bytes and declares component IDs 0/1/2 with sampling 0x22/0x11/0x11 and quantizer IDs 0/1/1. SOS uses table selectors 0/0x11/0x11 and spectral range 0-63. These headers do not prove the entropy payload interoperates with a standard decoder.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L608-L1022, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1068-L1190.

The DCT performs eight row butterflies, eight column butterflies and a signed right shift by two on all 64 results. Float temporaries and f64 constants feed integer truncation after each pass; it is not an exact real-valued transform. Quantization divides each base entry by the persistent scale before dividing each transformed coefficient by that integer result. Base minima and accepted scale 1-10 keep the current initialized tables nonzero; generic altered tables are not validated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L280-L431, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L93-L106, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1203-L1301, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1352-L1358.

The object snapshots have .data 0x450, .rodata 0x1B6, .sdata 4, extab 0x28 and extabindex 0x3C bytes each. Source .sdata2 has 0x7D bytes; target has 0x80 with trailing zeros. The constant pool includes conversion floats, integer-to-double bias material, DCT doubles, and JFIF at offset 0x78 plus zero at 0x7C. Metadata and tables are numeric/serialization data, not embedded image artwork. Both extab fragments are read-only in the existing objects. Their compiler provenance remains unverified.

The header includes seven owned declarations and four declarations belonging to hsd_3B5C. Foreign aliases were read as hypotheses only; no ownership of the decoder functions is claimed.

All 30 subjects, all inherited facts and all 25 outgoing links are reviewed. One attempt-based link remains unresolved. No proposed function rename or shared-family type change.
