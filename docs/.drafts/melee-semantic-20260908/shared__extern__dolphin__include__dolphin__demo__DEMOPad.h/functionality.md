## DEMOPad.h

This guarded header includes `<dolphin/pad.h>` and defines `DEMODMPad`, containing a `PADStatus`, five unsigned 16-bit button/direction fields, and four signed 16-bit stick-delta fields. The field names suggest button and direction transitions and stick movement deltas, but their computation is not established by this header. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/demo/DEMOPad.h#L1-L17.

It declares external storage `DemoPad[4]` and `DemoNumValidPads`, plus the void-returning functions `DEMOPadRead()` and `DEMOPadInit()`. These declarations do not establish initialization behavior, validity criteria, update ordering, error handling, or cross-file storage lifetimes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/demo/DEMOPad.h#L19-L24.

The complete rendered view agrees with canonical source, with no name substitutions or parse errors. Existing canonical names are consistent with the declarations; no supported naming correction is needed. Offset comments are source annotations, not compiled layout evidence. There are no frozen baseline subjects, facts, or links to disposition, and no proposals are warranted.

Status: researched; no-change lead bypass; independent review and live promotion pending.
