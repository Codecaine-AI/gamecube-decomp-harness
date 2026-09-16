## GXTransform.h

This guarded C/C++ interface header includes GXEnum.h and declares the GX transformation API. It defines GX_PROJECTION_SZ as 7 and GX_VIEWPORT_SZ as 6; these are header constants, not evidence of compiled layout ([canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXTransform.h#L1-L11)).

The declarations cover point projection, matrix- and pointer-based projection setup, immediate and indexed position/normal/texture matrix loading, and selection of the current matrix. Signatures distinguish 3×4 and 3×3 normal-matrix inputs, 16-bit indexed matrix selectors, and 32-bit matrix IDs ([canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXTransform.h#L13-L23)). Viewport setup includes a jitter variant with a field argument; additional declarations expose signed scissor-box offsets and clip-mode selection ([canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXTransform.h#L24-L27)).

All 34 canonical and rendered lines were reviewed. The rendered view reports no substitutions or parse errors; existing API names remain unchanged and require no supported correction. This header contains declarations rather than implementations, so projection calculations, field-value meanings, hardware effects, exceptional behavior, and pointer lifetimes are not established here. Subjects and links were exhaustively enumerated and are empty; there are no baseline facts or links to retain or revise.

Status: researched; no-change lead bypass; independent review and live promotion pending.
