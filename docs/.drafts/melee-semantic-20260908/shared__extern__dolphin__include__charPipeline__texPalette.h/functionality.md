## Texture palette declarations

`extern/dolphin/include/charPipeline/texPalette.h` defines the texture-palette interface with an include guard and C linkage support for C++ consumers.

- `CLUTHeader` declares an entry count, an `unpacked` byte, padding, a `GXTlutFmt`, and a data pointer. `TEXHeader` declares dimensions, format and data, wrap modes, minification/magnification filters, LOD bias, edge-LOD enable, LOD limits, and another `unpacked` byte ([canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/charPipeline/texPalette.h#L10-L32)). These declarations do not establish the numeric meanings or transitions of the `unpacked` fields.
- `TEXDescriptor` pairs texture-header and CLUT-header pointers. `TEXPalette` declares a version number, descriptor count, and descriptor-array pointer ([canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/charPipeline/texPalette.h#L34-L43)). Pointer ownership, optionality, and lifetimes are not specified here; offset comments are not compiled-layout verification.
- The API declares palette acquisition and release through pointer-to-pointer parameters, descriptor lookup by ID, and GX texture-object preparation interfaces. The `CI` variant additionally accepts a TLUT object pointer and a `GXTlut` argument ([canonical signatures](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/charPipeline/texPalette.h#L45-L49)). With no implementations in this file, allocation, release effects, ID validation, failure behavior, and cross-file resource lifetimes remain unestablished.

## Semantic review

All 56 canonical and rendered lines were reviewed. The rendered view has zero substitutions and zero parse errors; no naming discrepancy was found. Subject and link enumeration both returned empty results, and the frozen baseline contains no facts. No supported correction or meaningful rename is warranted, so the proposal is empty.

Status: researched; no-change lead bypass; independent review and live promotion pending.
