## GXEnum.h

This guarded header defines GXBool, boolean macros, and GX API enumeration constants. It contains no executable functions or runtime state/lifetime management. Its declarations cover projection, comparisons, pixel and vertex formats, textures, matrices, lighting, blending, TEV operations, indirect texturing, performance selectors, clipping, framebuffer copying, caches, TLUTs, and miscellaneous tokens.

### Semantic details preserved
- Texture formats combine base values with copy/depth flags; GX_TF_A8 aliases GX_CTF_A8. Null texture-map and disabled-texture selectors differ (0xFF versus 0x100). [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXEnum.h#L132-L212)
- Matrix selectors have explicit strides and identity values. Blend-factor aliases and overlapping component-count/type values require their respective API domains; numeric equality alone does not establish interchangeable meaning. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXEnum.h#L279-L441)
- Light selectors use individual bit values, with zero as null. Fog and TEV selectors include sparse values and explicit aliases, including color/alpha comparison aliases. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXEnum.h#L472-L689)
- Indirect-texture wrap OFF and wrap 0 are distinct enumerators. GX_CLIP_ENABLE is 0, unlike GX_ENABLE, which is 1. TLUT size enumerators carry encoded values rather than their literal name suffixes. Miscellaneous tokens explicitly assign flush=1, save-context=2, and null=0. [Indirect controls](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXEnum.h#L739-L786), [clipping through miscellaneous tokens](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXEnum.h#L878-L965), [boolean macros](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXEnum.h#L6-L12).

### Review outcome
All canonical and rendered pages were reviewed. The renderer reported zero substitutions and zero parse errors throughout; no proposed-name discrepancy was present. Subjects and links enumeration returned empty terminal pages, consistent with the zero-fact baseline. No supported correction or meaningful naming improvement warrants a proposal. Consumer behavior, hardware effects, and compiled layout are not inferred from these declarations.

Status: researched; no-change lead bypass; independent review and live promotion pending.
