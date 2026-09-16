## JPEG snapshot reconstruction

This unit implements a shared-state JPEG-style image reconstruction pipeline. `hsd_803B6BE4` initializes the input cursor, length, three DC predictors and entropy-bit cache, establishes `__setjmp` recovery, then searches in order for two DQT markers, SOF0 and SOS. Quantization bytes are reordered through the zigzag permutation. Each 16-by-16 region reconstructs four luma blocks, one Cb block and one Cr block, dequantizes them, applies the in-place inverse transform, and emits tiled RGB565 pixels.

`hsd_803B5C4C` reads positive-count MSB-first fields from shared entropy state and handles FF/00 stuffing. `hsd_803B5D70` selects fixed DC/AC and luma/chroma Huffman tables; its unmatched-code fallback is zero, indistinguishable from a valid zero symbol. `hsd_803B5EA0` reconstructs differential DC and scan-ordered AC coefficients. Its AC path specifically reads a symbol-selected bit field, subtracts one to obtain a zero run, then reads a second symbol and coefficient field; this must not be silently rewritten as the conventional packed JPEG run/size algorithm.

`fn_803B61B4` performs two cosine-weighted transform passes in place over 64 signed entries, truncating intermediate results to integers and finally shifting each sample right by two. `fn_803B6820` adds 128 to the shared luma samples, selects quarter-resolution chroma, converts and clamps RGB channels, and packs RGB565 into 4-by-4 tiled addressing. Width is rounded to a 16-pixel stride; height is unused by this helper. Full edge regions are written without clipping. The entry's `width * height * 2` return is therefore a nominal image size, not a destination-capacity guarantee.

## Errors and lifetime

Explicit marker-search exhaustion and entropy-reader failures longjmp to the entry and return zero. This is not comprehensive malformed-input validation: marker reads and fixed payload skips lack complete range checks, the stuffed follower is dereferenced before its bound check, and AC run expansion lacks an inner coefficient-bound check. Zero dimensions can also yield a normal zero return. A failed decode may leave partially changed quantization tables, workspace and destination pixels. Shared cursor/workspace/quantization state makes overlapping invocations unsafe without external coordination.

The canonical snapshot caller, `lbSnap_8001DE8C`, calls this decoder only when snapshot field `x0` equals 4, passes the stored payload and length, flushes the destination using stored snapshot dimensions even when decoding returns zero, and treats a nonzero return as success. No ownership transfer or destination allocation occurs in the decoder.

## Semantic assessment

All three existing rendered names fit canonical behavior and are retained without capitalization churn. The inverse-transform, pixel-output and entry functions remain unnamed in the frozen rendered view; this is not a semantic contradiction. The renderer reports no parse errors, but the page beginning at line 241 leaves the Huffman routine's bit-reader call canonical while later calls are substituted. Parameter and field names are outside renderer substitution coverage.

Existing table, reconstruction and snapshot knowledge is retained. Two entry facts are corrected to distinguish nominal output size from padded output storage and to avoid promising that every malformed input returns zero. Restored compiled artifacts corroborate the 0x630-byte data contribution, 112-byte numeric pool, and separate generated exception metadata. No fresh build, complete binary parity, or source-derived compiled-placement claim is made. The generated extab/extabindex records are distinct from the application's setjmp recovery buffer.

Status: synthesized; independent review and live promotion pending.
