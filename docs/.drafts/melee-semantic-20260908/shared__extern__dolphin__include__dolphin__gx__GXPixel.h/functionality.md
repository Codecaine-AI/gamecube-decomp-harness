## GXPixel.h

This guarded SDK header includes `GXEnum.h` and supplies C linkage when included from C++ ([lines 1–8](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXPixel.h#L1-L8)). It declares 13 void-returning GX pixel-state APIs:

- Fog configuration, fog-adjustment table initialization using a width and 4×4 projection matrix, and fog-range adjustment ([lines 10–12](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXPixel.h#L10-L12)).
- Blend factors and logic operation, color/alpha update controls, depth comparison and update controls, and depth-comparison location ([lines 13–17](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXPixel.h#L13-L17)).
- Pixel/depth format, dithering, destination alpha, odd/even field masks, and field mode with a half-aspect-ratio parameter ([lines 18–22](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXPixel.h#L18-L22)).

The canonical and rendered files were reviewed completely. The rendered view has no substitutions or parse errors; the existing declaration names fit their signatures. There are no owned subjects, baseline facts, or links to revise or retain. No semantic changes are proposed.

This file contains declarations only. It does not establish implementation branches, numeric enum meanings, hardware register effects, pointer lifetimes, or compiled layout.

Status: researched; no-change lead bypass; independent review and live promotion pending.
