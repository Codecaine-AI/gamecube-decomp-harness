## Sample playback parameter setup

`__SYNSetupSample` asserts that the voice pointer is non-null and dispatches on ADPCM, PCM16, or PCM8 sample format. The default branch asserts with `unknown sample format` and returns; it supplies no fallback setup. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synsample.c#L311-L328)

All three format helpers configure the existing voice's AX parameter block. They select their looping branch using exactly `(loopStart + loopLength) != 0`, assigning `voice->type = 1` there and `0` otherwise. These assignments establish local branch meanings, not a complete cross-file enumeration of voice types.

### ADPCM

`__SYNGetNibbleAddress(count)` computes `16 * (count / 14) + 2 + count % 14`, accounting for two header nibbles per 14-sample frame. ADPCM setup starts from `aramBaseNibble + sample->offset`, checks frame alignment, and advances the initial playback address by two nibbles. Loop addresses use the helper on `loopStart - 1` and `loopStart + loopLength - 2`; nonlooping playback ends at the helper result for `sample->length - 1`. Assertions check that calculated loop/end addresses avoid the first two nibbles of a frame. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synsample.c#L14-L45)

The helper writes address words and copies ten words beginning at `voice->adpcm->a`. Only the looping branch also copies the following three halfwords into the named ADPCM loop-state fields. Both branches mask `sync` with `0xFFFE1FFF`; looping ORs `0x121000`, while nonlooping ORs `0x21000`. Nonlooping does not explicitly clear the loop-state fields. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synsample.c#L49-L136)

### PCM

PCM16 uses `aramBaseWord + offset`; PCM8 uses `aramBaseByte + offset`. For both, the looping address is `sampleStart + loopStart - 1`, its end is `sampleLoop + loopLength - 1`, and the nonlooping end is `sampleStart + sample->length - 1`. The address-block leading words are `0x1000A`/`0xA` for looping/nonlooping PCM16 and `0x10019`/`0x19` for PCM8. Each writes eight zero words after the address words, followed by `0x08000000` for PCM16 or `0x01000000` for PCM8, then another zero word. Both finish with `sync = (sync & 0xFFFE1FFF) | 0x21000`. These describe source-level writes, not independently verified compiled layout. [PCM16 source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synsample.c#L139-L224); [PCM8 source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/syn/synsample.c#L226-L309)

### Semantic assessment

The existing function names accurately describe format-specific sample setup and nibble-address conversion. Both rendered pages preserve canonical function names, report zero substitutions and zero parse errors, and expose no misleading proposed names. The frozen baseline contains no subjects, facts, or links to retain or correct. No knowledge changes are proposed. Address subtraction is not locally guarded against invalid lengths or loop inputs; this review does not infer external validation or ownership guarantees.

Status: synthesized; independent review and live promotion pending.
