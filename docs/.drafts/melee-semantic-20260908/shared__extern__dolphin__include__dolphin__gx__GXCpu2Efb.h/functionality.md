## GXCpu2Efb.h

This header declares the GX CPU-to-EFB interface; it contains declarations, not implementations. It includes GXEnum.h and supplies an include guard and C linkage for C++ consumers ([source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXCpu2Efb.h#L1-L8), [closing guards](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXCpu2Efb.h#L25-L29)).

The interface exposes poke configuration for alpha comparison, alpha read mode, alpha and color updates, blending and logic operations, destination alpha, dithering, and depth comparison/update ([declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXCpu2Efb.h#L10-L17)). ARGB and depth peek/poke declarations take u16 coordinates; peeks take u32 output pointers, whereas pokes take u32 values. Depth compression/decompression declarations take a u32 depth value and GXZFmt16 format and return u32 ([declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXCpu2Efb.h#L18-L23)). These signatures do not establish register effects, coordinate validation, numeric encodings, conversion algorithms, exceptional behavior, or pointer lifetimes.

All 30 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors; existing names fit the declared interface. Its eight shadowed bindings are rendering metadata, not independent evidence of implementation behavior. The scoped baseline contains no subjects, facts, or links, so no retention dispositions or factual corrections are necessary.

Status: researched; no-change lead bypass; independent review and live promotion pending.
