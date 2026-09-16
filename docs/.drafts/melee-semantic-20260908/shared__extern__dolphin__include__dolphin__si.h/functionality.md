## Serial interface header

`extern/dolphin/include/dolphin/si.h` defines the public SI constants, callback types and function declarations; it contains no implementation bodies.

- Four channel-selection bits occupy bits 31–28, and `SI_MAX_CHAN` is 4. Error/status constants range from `SI_ERROR_UNDER_RUN` (0x0001) to `SI_ERROR_BUSY` (0x0080). [Channel/status definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/si.h#L4-L16), [channel count](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/si.h#L49-L49).
- Device identification definitions distinguish N64 and Dolphin/GC types and provide wireless masks and composite device constants. `SI_TYPE_GC` aliases `SI_TYPE_DOLPHIN`; `SI_TYPE_N64` and `SI_WIRELESS_CONT` are zero-valued definitions, not evidence that a device is absent. `SI_GC_WAVEBIRD` combines GC type, wireless, standard, wireless-state and fixed-ID bits. [Type definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/si.h#L18-L47).
- `SICallback` takes a channel, status word and `OSContext` pointer; `SITypeAndStatusCallback` takes a channel and type word. `SITransfer` declares separate output/input buffers and byte counts, a callback and an `OSTime` delay. Other declarations expose command retrieval, polling enable/disable, XY configuration, command transfer and a busy query. The header alone does not establish buffer ownership or lifetime, callback timing, delay units, return-value semantics or exceptional runtime paths. [Callback types and API declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/si.h#L51-L61).

## Semantic assessment

All 65 canonical and rendered lines were reviewed. The renderer reports zero parse errors and zero substitutions; no proposed rename changes the source. Its `callback` annotation is explicitly marked as a shadowed binding and does not establish a relationship to the unrelated fighter symbol. Existing canonical names fit the declarations and constants; no supported correction is needed. Exhaustive subject and link enumeration returned no baseline records, so there are no retention IDs or exceptions. No compiled layout or implementation behavior is inferred.

Status: researched; no-change lead bypass; independent review and live promotion pending.
