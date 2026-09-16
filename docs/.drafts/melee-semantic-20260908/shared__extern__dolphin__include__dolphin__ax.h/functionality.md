## AX shared interface

`extern/dolphin/include/dolphin/ax.h` declares the AX audio interface and its parameter records; it contains no function implementations. AXPB combines mixing, ITD, update, depop, volume-envelope, FIR, sample-address, ADPCM, sample-rate-conversion and ADPCM-loop records. AXVPB adds linked-list pointers, priority, callback/context, synchronization and update bookkeeping, an ITD-buffer pointer and an embedded AXPB. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/ax.h#L7-L147.

Additional records describe channel depop values, profiling timestamps/counts and auxiliary channel pointers. Constants specify 64 voices, 32 priority stacks, SRC selector values and synchronization masks. Unknown synchronization bits remain explicitly tentative; offset comments are not compiled-layout evidence. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/ax.h#L149-L238.

The public declarations cover initialization/shutdown, voice acquisition/freeing and priority, auxiliary and frame callbacks, mode selection, profiling, voice-parameter setters and DSP-cycle controls. External declarations expose profiling/DSP task data and DSP image arrays. These declarations do not establish exceptional branches, callback lifetimes, numeric state meanings or implementation-side synchronization behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/ax.h#L241-L296.

## Semantic assessment

All 299 canonical and rendered lines were reviewed. Rendered declarations remain unchanged, with zero substitutions and zero parse errors. Shadowed-binding diagnostics are not evidence of semantic identity. Existing source names fit the declared interface; no supported naming correction is warranted. Subject and link enumeration returned no records, so there are no baseline facts or links requiring retention or exceptions. The proposal is intentionally empty.

Status: synthesized; independent review and live promotion pending.
