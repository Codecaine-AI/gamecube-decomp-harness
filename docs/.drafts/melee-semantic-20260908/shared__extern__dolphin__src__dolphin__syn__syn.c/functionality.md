## Synthesizer lifecycle and frame processing

This file maintains a global synthesizer list and coordinates a 64-entry external voice array. `SYNInit` clears only each voice's synth association and the list head; `SYNQuit` calls that reset, rather than explicitly releasing mixer or AX resources. Each audio frame services all 64 voices before processing buffered input for listed synthesizers. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/syn.c#L53-L79.

List insertion prepends under disabled interrupts. Removal also disables interrupts, but rewrites `tempSynth->next` before the loop advances through that same field. For an ordinary acyclic list, the first non-target node receives a null next pointer and terminates traversal; this is not a conventional unlink or complete list reversal. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/syn.c#L17-L51.

## Per-synth initialization and shutdown

`SYNInitSynth` asserts nonzero synth, wavetable and ARAM base inputs. Six wavetable-relative offsets become instrument, region, articulation, sample and ADPCM pointers; the file does not copy those tables. It stores word, byte and nibble forms of the ARAM base and three priorities, zeros master volume, calls the external controller reset, initializes input bookkeeping and note count, clears 16×16 key-group entries and 16×128 voice entries, then registers the synth. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/syn.c#L81-L127.

`SYNQuitSynth` disables interrupts and scans the external voice array only when `synth->notes` is nonzero. Matching voices have their mixer channel released, their AX voice freed, and their synth association cleared. It then invokes list removal and restores interrupts. This function does not explicitly clear the synth's note count or per-note tables, nor free the synth or wavetable. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/syn.c#L129-L148.

## Input and accessors

`SYNMidiInput` appends exactly three bytes, advances the input pointer and increments the event counter. The capacity assertion occurs after those writes and fires when the counter is greater than or equal to `SYN_INPUT_BUFFER_SIZE`; no pre-write capacity guard, wrapping or recovery is present here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/syn.c#L150-L173.

Both master-volume accessors use a left shift by 16: the setter stores `dB << 0x10`, and the getter returns `masterVolume << 0x10`. The getter must not be explained as the inverse of the setter; signed-shift limitations also preclude assuming universally defined arithmetic. The active-note accessor returns the stored count directly. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/syn.c#L175-L191.

## Semantic review outcome

All 192 canonical and rendered lines were reviewed. The renderer reported zero substitutions and zero parse errors; names remain canonical, with no owned baseline subjects, facts or links to revise or retain. Existing lifecycle names broadly describe their roles, but removal and volume-getter behavior require the qualifications above. No compiled section or layout conclusions are drawn from the source's `.sbss` comment. No knowledge writes are proposed.

Status: synthesized; independent review and live promotion pending.
