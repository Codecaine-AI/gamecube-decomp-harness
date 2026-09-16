## Internal synthesizer interface

`extern/dolphin/src/dolphin/syn/__syn.h` is an include-guarded declaration header importing `<dolphin/syn.h>`. It groups internal interfaces by implementation filename; it contains no function bodies or initialized data definitions.

- Synthesizer/controller declarations expose `__SYNSynthList`, the 128-element float array `__SYNn128`, and note clearing, controller reset/set, and buffered-event interfaces ([canonical lines 1–17](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/__syn.h#L1-L17)).
- Envelope and LFO declarations distinguish setup from run operations for voices. Mixing declarations include `long` arrays of 128 and 100 elements, volume/pan setup, input/fader queries, and mix updating ([lines 19–38](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/__syn.h#L19-L38)).
- Remaining declarations cover relative pitch, pitch/SRC setup and updating, sample setup, a 64-element external voice array, reference clearing, release with an `unsigned long priority` argument, indexed voice service, and an integer-returning wavetable-data interface ([lines 40–57](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/__syn.h#L40-L57)).

The complete canonical and rendered views agree; the renderer reported zero substitutions and zero parse errors. There are no baseline subjects, facts, or links to retain or correct. No proposal is warranted from this declaration-only evidence. In particular, the header does not establish the distinction between the two per-channel reset routines, table values or units, state transitions, exceptional branches, return-code meanings, or cross-file reference lifetimes. No compiled layout or placement conclusions are drawn.

Status: researched; no-change lead bypass; independent review and live promotion pending.
