### OSRtc.h
This guarded, C++-compatible header declares SRAM-related source structures and configuration APIs. It defines sound constants MONO=0 and STEREO=1 and video constants NTSC=0 and MPAL=2; it does not establish a meaning for video value 1 or enumerate all valid modes (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSRtc.h#L1-L14).

`SramControl` declares a 64-element unsigned-char SRAM buffer, offset, enabled/locked/sync integer fields and a callback pointer. `OSSram` declares checksum fields, ead0/ead1, counterBias, horizontal display offset, ntd, language and flags. `OSSramEx` declares two 12-element flash IDs, wireless keyboard and four pad IDs, DVD error code, checksum bytes and explicitly named padding arrays. These declarations do not establish compiled sizes, offsets, synchronization semantics or callback lifetime (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSRtc.h#L16-L45).

The API declarations cover sound mode, video mode, language and progressive mode getters/setters plus a wireless-ID getter. There are no implementations here to prove validation, failure branches, persistence or wireless-ID index semantics. The header uses u32/u16/s32 without defining or including their definitions locally (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSRtc.h#L47-L55).

All 62 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors; its shadowed-binding annotations do not independently prove implementation behavior. Existing descriptive declarations require no supported correction. The frozen subject and link enumerations are empty, so there are no baseline facts or links to retain or revise.

Status: researched; no-change lead bypass; independent review and live promotion pending.
