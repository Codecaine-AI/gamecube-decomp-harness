## G2D interface header

`extern/dolphin/include/dolphin/G2D.h` defines the Dolphin G2D data types and declares six public operations; it contains no function implementations.

- The material-category enum lists texture, direct RGB, indexed RGBA8, and empty categories. Sprite data includes unsigned top-left coordinates and dimensions, a GX texture-object pointer, and four floating-point S/T values. Position/orientation and global data provide paired position/orientation fields, viewport dimensions, camera data, and world/half-size fields. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/G2D.h#L6-L42)
- Material descriptors reference GX colors, textures, and a color lookup table. Tile descriptors contain material, S/T, color-index, and four user bytes. Layers contain a map pointer, signed configuration fields, tile dimensions, a wrap field, a material count, and tile/material descriptor pointers. The header does not establish pointer ownership or lifetime. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/G2D.h#L44-L71)
- Declarations expose sprite initialization, sprite and layer drawing, camera setting, world initialization, and viewport setting. Layer drawing accepts an `s8*` sort buffer; its required size and lifetime are not specified here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/G2D.h#L73-L78)

The complete canonical and rendered views agree, with no rendered name substitutions or parse errors. Existing identifiers fit the declared interface; there are no frozen subjects, facts, or links to correct or retain. No semantic proposals are warranted from this header alone.

Status: synthesized; independent review and live promotion pending.
