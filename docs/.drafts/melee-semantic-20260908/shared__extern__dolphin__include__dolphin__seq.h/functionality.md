## Dolphin sequence interface

`extern/dolphin/include/dolphin/seq.h` declares sequence and track data structures plus the public sequence API; it contains no implementation bodies.

- `SEQTRACK` declares a sequence pointer, start/end/current byte pointers, status, timing fields (`beatsPerSec`, default/current ticks per frame, delay), and a numeric state. Their precise runtime interpretation is not established here. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/seq.h#L6-L17)
- `SEQSEQUENCE` declares linkage and sequence bookkeeping fields, an embedded `SYNSYNTH`, 128 controller callback slots accepting `(void *, u8)`, and 64 track slots. These are source declarations, not independently verified compiled offsets or layout. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/seq.h#L19-L29)
- The API declares initialization, shutdown, audio-frame processing, sequence addition/removal, controller callback registration, state access, track-indexed tempo access, and sequence volume access. Addition accepts a MIDI stream, a `wt` pointer, an ARAM base, and three separately named priority arguments. Tempo setting uses a parameter named `bpm`; volume setting uses `long dB`. The header does not establish allocation, ownership, validation, exceptional paths, or callback lifetimes. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/seq.h#L33-L45)
- `SEQ_ALL_TRACKS` is defined as `-1`, whereas tempo declarations take unsigned `u32 trackIndex`. No implementation-level sentinel behavior or numeric state meanings are inferred. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/seq.h#L31-L43)

## Semantic assessment

All 48 canonical and rendered lines were reviewed. The rendered view makes no substitutions and reports no parse errors. Existing source names fit the declared interface; no supported renaming or factual correction is warranted. The renderer's unrelated shadowed-binding annotation for `callback` does not establish identity with that foreign symbol. Subject and link enumeration both returned empty baselines, so there are no retained or exceptional baseline records and no writable subjects for fact proposals.

Status: synthesized; independent review and live promotion pending.
