## Dolphin synthesizer interface

`extern/dolphin/include/dolphin/syn.h` declares synthesizer data structures and APIs; it contains no function implementations.

- Wavetable records describe 128-key instrument region mappings, region tuning and loop parameters, articulation parameters, sample metadata, and ADPCM coefficients/history (`code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/syn.h#L8-L63`).
- `SYNSYNTH` holds wavetable pointers, ARAM address representations, voice priorities, 16-channel instrument/controller and attenuation arrays, a 256-by-3-byte input array, input bookkeeping, note count, and key-group/voice pointer tables (`code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/syn.h#L6-L6`, `code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/syn.h#L65-L96`).
- `SYNVOICE` references an AX voice parameter block, synthesizer, and wavetable records, alongside MIDI key/channel information and pitch, attenuation, LFO, and envelope-related state. The header does not define numeric state meanings, transition rules, pointer ownership, or object lifetimes (`code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/syn.h#L98-L139`).
- Sample format constants explicitly assign ADPCM=0, PCM16=1, and PCM8=2. The API declares global and per-synth initialization/shutdown, audio-frame processing, MIDI input, master-volume access, active-note counting, and controller lookup. Comments associate these declarations with `syn.c` and `synctrl.c`; runtime behavior and exceptional paths require implementation evidence (`code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/syn.h#L141-L158`).

## Semantic assessment

All 161 canonical and rendered lines were reviewed. The renderer reports zero substitutions and zero parse errors; all ten function names remain unchanged and have no KB identity. Existing declarations are coherent at interface level, with no supported naming correction identified. Offset comments are not treated as compiled-layout evidence. The frozen subject, fact, and link inventories are empty, so no retention rows or factual edits are required.

Status: researched; no-change lead bypass; independent review and live promotion pending.
