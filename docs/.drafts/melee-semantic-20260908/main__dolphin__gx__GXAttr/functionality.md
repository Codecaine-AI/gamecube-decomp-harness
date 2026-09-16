## GXAttr semantic review

GXAttr implements GX vertex-input configuration and texture-coordinate generation. Existing function names match their canonical behavior; the rendered view contains no function-name substitutions or parse errors. Parameter and section names are outside the renderer's substitution coverage and were assessed against canonical evidence instead.

### Descriptor and format lifetimes
- Descriptor setters update cached VCD words and publish dirty mask `0x8` (bit index 3). Matrix-index fields are one bit; ordinary descriptor fields are two bits. Enabling NRM or NBT clears the other's presence flag; disabling one clears only its own flag. The shared normal descriptor is reconstructed from the surviving flags and cached type.
- `GXClearVtxDesc` clears the descriptors and normal flags but restores the position field to numeric value 1. It does not issue register commands.
- `__GXSetVCD` always emits both descriptor words and invokes `__GXXfVtxSpecs`. It recomputes `vLim` only when `vNum != 0`; otherwise the previous value survives. Its fixed lookup tables serve flush-primitive sizing, not a general VAT-sensitive measurement of arbitrary submitted vertices.
- XF vertex specifications contain active color and texture-coordinate counts plus a normal-mode encoding: 0 for neither normal flag, 1 for normals, and 2 for NBT. The value 2 is not a literal count of two normal vectors.
- VAT setters pack attribute-dependent fields into one of eight cached A/B/C triples, set dirty mask `0x10`, and mark the selected format in `dirtyVAT`. NBT3 sets the normal-count bit and the separate bit 31; fractional precision is stored for position and texture coordinates, not normal or color attributes. `__GXSetVAT` emits dirty triples in ascending format order and clears `dirtyVAT`.
- In GXGeometry, the dirty-state dispatcher commits the marked categories and clears `dirtyState`; `GXBegin` invokes it before primitive submission. The flush primitive consumes `vNum * vLim` using four-byte zero writes.

### Queries and list variants
Descriptor and VAT queries decode software shadows rather than read hardware. Descriptor queries preserve the distinction between NRM and NBT through their presence flags. Unsupported descriptor queries return zero; unsupported format queries return the source's `GX_TEX_ST`, `GX_RGB565`, and zero defaults. Format queries reconstruct NBT3 from the packed bits. List setters stop at their sentinels, and list getters append sentinels after enumerating the source-defined attribute range.

### Immediate and mixed updates
- `GXSetArray` aliases NBT to NRM, masks the base pointer with `0x3FFFFFFF`, and immediately emits paired base/stride register commands. Macro expansion additionally updates `indexBase` and `indexStride` when `cpAttr - 12` is in 0..3. Thus the baseline assertion that it never updates cached GX context is incorrect. It does not stage a dirty-state commit or copy array contents.
- `GXInvalidateVtxCache` emits command byte `0x48`, without staged descriptor or format updates.
- `GXSetTexCoordGen2` selects source row/form and matrix, bump, or SRTG encoding, writes two XF registers, updates the destination's shared matrix-index word, and invokes GXTransform's matrix-index commit. That helper emits CP and XF state and sets `bpSent`. The post-matrix API ID is translated by subtracting 64 before six-bit insertion.
- Bump functions are numeric cases 2..9 with a source assertion for 12..18; the implementation does not compare source order with destination order. Generated-coordinate source cases leave the default row/form unchanged. SRTG chooses color0 only for `GX_TG_COLOR0`, otherwise its color1 branch; there is no dedicated SRTG color-source assertion.
- `GXSetNumTexGens` immediately emits the XF count while updating cached general mode and setting dirty mask 4. HSD accumulates the required count from coordinate registrations and resets its accumulator after committing it. Configuring generator slots is distinct from selecting the active count.

### Evidence boundaries
Validation uses assertion macros, not explicit recoverable error returns. `SET_REG_FIELD` asserts width but inserts the supplied value without masking it to that width, so invalid inputs must not be described as safely clamped. XF addresses quoted as 8, 0x3F, 0x40+destination, and 0x50+destination are macro-relative selectors; the write macro adds 0x1000.

Source declarations establish diagnostic strings and three static byte tables, but do not establish their compiled section membership, ordering, or complete section contents. The seven section facts and one section link remain unresolved pending appropriate compiled evidence. The ledger explicitly retains 43 facts and 13 links, supersedes seven facts, and leaves seven facts and one link unresolved.

Status: synthesized; independent review and live promotion pending.
