## synmix.c

This file defines synthesizer attenuation tables and helpers that initialize voice volume/pan and forward current attenuation settings to the MIX interface.

- `__SYNVolumeAttenuation` contains 128 entries; `__SYNAttackAttnTable` contains 100. Both begin with `0xFC400000` and end with zero. The attack table has no consumer within this file. The source comment `.data` is not compiled section-placement evidence. [Canonical tables](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synmix.c#L9-L53)
- `__SYNSetupVolume` asserts that the voice pointer is non-null and stores region attenuation plus the velocity-indexed volume-table entry in `voice->attn`. It performs no local velocity-range validation. [Volume setup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synmix.c#L55-L60)
- `__SYNSetupPan` asserts the voice pointer and stores articulation pan for numeric MIDI channel 9; all other channels use controller index 10. [Pan setup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synmix.c#L62-L70)
- `__SYNGetVoiceInput` adds base, LFO, and volume-envelope attenuation before shifting right by 16. `__SYNGetVoiceFader` similarly sums channel volume attenuation, channel expression attenuation, and synth master volume before shifting. These helpers do not clamp their results. [Attenuation getters](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synmix.c#L72-L83)
- `__SYNUpdateMix` updates input, auxiliary A, auxiliary B, and fader for `voice->axvpb`. Auxiliary attenuation values are independently shifted right by 16. Pan is refreshed directly from controller index 10 only when the channel is not 9; it does not use the cached `voice->pan`. Consequently, this routine leaves channel-9 mixer pan unchanged; where its initial pan is installed is outside this file. [Mixer update](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synmix.c#L85-L97)

The complete rendered view has zero substitutions and zero parse errors. Existing canonical function names fit their implementations; no supported naming correction is needed. The frozen baseline contains no subjects, facts, or links, and the assignment exposes no writable subjects. No proposals are warranted. Object ownership, external table consumers, and mixer initialization lifetimes are not established by this file.

Status: researched; no-change lead bypass; independent review and live promotion pending.
