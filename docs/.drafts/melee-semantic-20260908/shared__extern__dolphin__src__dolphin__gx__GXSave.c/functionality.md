## GXSave.c semantic review

The entire file is guarded by `#if DEBUG`. It implements display-list verification-state shadowing and diagnostic printing, not a general save/restore facility. Both canonical and rendered views were read through line 479. The renderer reported no parse errors or substitutions. Subject and link enumeration returned empty baselines; there are no existing facts or names to correct and no writable subjects, so the proposal is empty.

### Stream and attribute handling

`__ReadMem` copies bytes from a shared static cursor, rejecting requests larger than `dlistSize - bytesRead`, and advances both cursor and count only on success. `DPF` has an empty operational body. `__SaveCPRegs` ignores classes 0–4, updates vertex descriptors for 5–6, VAT arrays for 7–9, conditionally updates indexed bases/strides for 10–11, and reports other classes. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXSave.c#L8-L82)

`GetAttrSize` computes attribute byte sizes from descriptor fields and VAT-derived table indices. Descriptor values 0, 2, and 3 yield zero, one, and two bytes; value 1 selects direct-data calculations. Attributes 0–8 instead use individual enable bits; unsupported attribute numbers return zero. Direct component table indices are not range-validated, and texture-attribute branches consistently read `vatA` as written. `__ParseVertexData` reads a vertex count, sums attribute sizes for 0–24, multiplies by the count, and skips that many bytes without checking the remaining list length. Thus bounded individual reads do not make this a fully validated parser. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXSave.c#L84-L304)

### Dispatch and persistent state

`__GXShadowDispList` returns immediately when verification is disabled; otherwise it initializes the shared stream cursor. Command bits 3–7 select the operation and bits 0–2 supply `vatIdx`. Operations 0 and 9 do nothing; 16 and 18–23 verify state before skipping vertex data; 1 shadows CP data; 2 forwards successive XF words through `VERIF_MTXLIGHT` using an encoded count plus one; 4–7 perform indexed shadow loads; 12–13 store raster words by their high-byte register address. Nested display lists report and terminate; unknown operations report and continue. Failed payload reads generally skip updates rather than terminate the whole parse, potentially leaving trailing bytes to be interpreted as commands. Changes to external `gx` and `__gxVerif` state are not rolled back or cleared on return. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXSave.c#L306-L388)

`__GXShadowIndexState` selects base/stride slot `idx_reg - 4`, converts the physical base to a cached pointer, and starts reading at `index * stride`. It forwards exactly the encoded four-bit count of words, advancing source memory by stride and destination address by one; unlike the direct XF path, it does not add one to the count. Those external memory reads are not bounded by the display-list size. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXSave.c#L390-L417)

### Diagnostics and interpretation limits

`__GXPrintShadowState` reports CP descriptors and eight VAT entries, dirty-selected matrix/light/XF groups, and all 256 raster registers. The normal-matrix section tests `xfNrmDirty` but reads values from `xfMtx`; this discrepancy is preserved rather than described as printing a distinct normal-matrix data array. The function does not clear dirty flags. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXSave.c#L419-L476)

Canonical names broadly fit these operations, although `__ParseVertexData` skips calculated payload bytes rather than decoding vertices. No rendered rename hypothesis needs correction. Source-level observations do not establish hardware-format fidelity, external initialization or memory ownership, or compiled inclusion and layout.

Status: synthesized; independent review and live promotion pending.
