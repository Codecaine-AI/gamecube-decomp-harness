## Synthesizer voice LFO

`__SYNLfo` is a 64-entry floating-point sine-like waveform table spanning approximately −1 to +1. `__SYNSetupLfo` asserts the voice pointer, clears phase and attenuation/pitch outputs, and copies frequency, delay, attenuation depth, and controller-dependent depths from the articulation. Importantly, it then assigns `art->lfoPitch` to `lfoCents`, not `lfoCents_`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synlfo.c#L8-L32)

`__SYNRunLfo` asserts the voice pointer. While delay is nonzero, it only decrements delay; phase and outputs remain unchanged, including on the call that decrements delay to zero. Otherwise it advances phase by `lfoFreq`, selects the waveform using `(lfoState >> 0x10) % 64`, and indexes `__SYNn128` with MIDI controller 1 for the voice's channel. Attenuation and pitch outputs multiply the waveform sample by their respective base depth plus controller-scaled depth. The pitch calculation reads `lfoCents_`, distinct from setup's `lfoCents` assignment. This file does not establish the initialization or lifetime of `lfoCents_`, controller-table bounds, phase signedness/overflow behavior, or real-time update frequency. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synlfo.c#L34-L52)

The rendered file matches canonical behavior, with no substitutions or parse errors. Existing function names accurately describe setup and execution of the LFO. There are no frozen subjects, facts, or links to revise or retain, and no writable subjects; the proposal is empty.

Status: synthesized; independent review and live promotion pending.
