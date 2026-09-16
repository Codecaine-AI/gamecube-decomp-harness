## AXFX shared interface

`extern/dolphin/include/dolphin/axfx.h` declares effect state and interfaces for standard reverb, high reverb, delay, and chorus.

- Standard reverb work contains six-element `AP` and `C` delay-line arrays, coefficients, three-channel low-pass history and pre-delay pointers. High reverb uses nine-element arrays and additionally declares crosstalk fields. Both public reverb structures embed work state and expose coloration, mix, time, damping, pre-delay, and a `tempDisableFX` byte. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/axfx.h#L6-L76.
- `AXFX_BUFFERUPDATE` supplies left, right, and surround pointers. Delay state declares three-element current-state and parameter arrays plus channel pointers. Chorus state declares channel-history pointers and samples, split position/pitch fields, source information, and base-delay/variation/period parameters. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/axfx.h#L37-L41 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/axfx.h#L78-L124.
- Each effect has integer-returning init, shutdown, and settings declarations and a void callback taking buffer-update and effect-state pointers. The header also declares `DoCrossTalk`, external allocation/free function pointers, allocation/free functions, and a hook setter. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/axfx.h#L126-L162.

The canonical names fit the declared interfaces; the rendered view makes no substitutions. There are no owned baseline subjects, facts, or links requiring dispositions, and no supported correction warrants a proposal. These declarations do not establish processing algorithms, parameter units/ranges, return-code meanings, exceptional branches, pointer ownership or cross-file lifetimes. Offset comments are source annotations, not independently verified compiled layout.

Status: synthesized; independent review and live promotion pending.
