## Controller interface header

`extern/dolphin/include/dolphin/pad.h` defines controller constants, the `PADStatus` source declaration, and PAD API prototypes; it contains no function implementations.

- Specification identifiers range from 0 through 5; motor commands distinguish stop (0), rumble (1), and hard stop (2). Four channel masks occupy bits 31–28, and the declared controller maximum is four. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/pad.h#L6-L22)
- Button definitions include identical MENU and START masks at bit 12. Additional stick, combined-trigger, and action masks extend through bit 39. These wider masks cannot all be represented in the `u16 button` member of `PADStatus`; the header does not explain their downstream interpretation. [Masks](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/pad.h#L24-L53) [Status declaration](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/pad.h#L62-L73)
- Error constants distinguish none (0), no controller (-1), not ready (-2), and transfer failure (-3). `PADStatus` declares signed stick/substick axes and error storage, unsigned trigger and analog-button values, and a button field. Source offset comments are not independent compiled-layout evidence. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/pad.h#L55-L73)
- Prototypes expose reset, recalibration, initialization, reading, sampling-rate control, motor control, specification selection/query, type query, synchronization, analog-mode selection, recalibration disabling, SI sampling refresh, and clamping. Signatures alone do not establish return-value meanings, buffer lifetimes, exceptional execution paths, or actual clamping behavior. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/pad.h#L75-L93)

## Semantic review

All 96 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; function names remain unchanged. Existing names fit the declared interface, with no supported correction needed. Subject and link enumerations are empty, so there are no baseline facts or links to retain or revise. No new knowledge writes are proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
