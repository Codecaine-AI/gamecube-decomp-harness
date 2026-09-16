## DOL format declarations
The header includes Dolphin types and provides C linkage guards. It defines maximum text/data segment counts of 7 and 11, respectively, and declares DolImage with corresponding pointer, u32, and length arrays; scalar bss, bssLen, and entry fields; and 28 padding bytes (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dolformat.h#L1-L26). It declares DOLLoadImage(u8 *buffer, BOOL verbose), returning void *, and DOLRunApp(void *entryPoint), returning void (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dolformat.h#L28-L33). These declarations do not establish loading behavior, pointer ownership, failure handling, entry transfer semantics, or compiled layout.

Canonical and rendered lines 1–36 were reviewed; rendering reports no substitutions or parse errors. Names fit the declaration-level roles and no supported correction is needed. The subject and link inventories are empty; there are no baseline facts to retain or revise.

Status: researched; no-change lead bypass; independent review and live promotion pending.
