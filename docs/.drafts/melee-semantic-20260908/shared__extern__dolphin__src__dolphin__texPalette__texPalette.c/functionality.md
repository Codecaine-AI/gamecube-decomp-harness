## Texture palette loading and GX object initialization

The entire 119-line canonical file and rendered view were reviewed. The renderer reports zero substitutions and zero parse errors; existing function names fit their implementations. The frozen subject and link inventories are empty, so there are no baseline records to retain or correct and no supported scoped naming changes to propose.

### Loading and lifetime
`TEXGetPalette` looks up a named palette when `DOCacheInitialized` is set. If `*pal` is null, it loads the palette and, when caching is enabled, registers it with `TexFreeFunc` and calls `DSGetCacheObj` again. Without caching, the incoming `*pal` is tested without first being initialized: a non-null value skips loading. `LoadTexPalette` opens the DVD file, allocates and reads its length rounded up to 32 bytes at priority 2, closes it, and unpacks it. No local checks handle open, allocation, or read failure. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/texPalette/texPalette.c#L12-L37.

`TexFreeFunc` frees the palette allocation. `TEXReleasePalette` delegates to `DSReleaseCacheObj` when caching is enabled; otherwise it frees the allocation and clears the caller's pointer. The cached branch does not clear that pointer. Exact cache reference-count behavior and destruction timing belong to the external cache implementation and are not established here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/texPalette/texPalette.c#L74-L87.

### Relocation and access
`UnpackTexPalette` panics on a version other than `0x20AF30`. It relocates the descriptor array and each non-null texture/CLUT header relative to the palette base. Header data pointers are relocated only when the corresponding `unpacked` flag is false, after which that flag is set. These flags protect data-pointer relocation, not the descriptor-array or header-pointer relocations, so this is not an generally idempotent unpack operation. Null headers are permitted during unpacking. `TEXGet` asserts that the index is below `numDescriptors` and returns a pointer into the palette's descriptor array, rather than allocating a descriptor. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/texPalette/texPalette.c#L39-L72.

### GX conversion
Both GX helpers obtain a descriptor and enable mipmapping exactly when its minimum and maximum LOD differ. They initialize texture objects using the header's data, dimensions, format, wrapping, filters, LOD range and bias, with `GX_DISABLE` and `GX_ANISO_1` supplied to LOD initialization. The CI variant additionally initializes a TLUT object from the CLUT header and associates the supplied TLUT identifier with the texture object. Unlike unpacking, these helpers dereference their required headers without null checks. Neither helper performs a GX texture/TLUT load call here; backing-data lifetime must therefore not be inferred to end upon object initialization. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/texPalette/texPalette.c#L89-L118.

No compiled layout or section claims are made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
