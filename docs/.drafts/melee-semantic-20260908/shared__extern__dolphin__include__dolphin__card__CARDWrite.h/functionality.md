This guarded header declares `CARDWriteAsync` and `CARDWrite`. Both return `long` and accept `struct CARDFileInfo *fileInfo`, `void *buf`, `long length`, and `long offset`; `CARDWriteAsync` additionally accepts a callback returning `void` and taking two `long` arguments. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/card/CARDWrite.h#L1-L7.

The canonical and rendered declarations agree, with no proposed-name substitutions. The names distinguish the callback-bearing interface from the interface without a callback; this declaration-only file cannot establish execution timing, return-code meanings, callback argument semantics, buffer lifetimes, or exceptional behavior. No unsupported implementation claims or renames are proposed. There are no baseline subjects, facts, or links to retain or correct.

Status: synthesized; independent review and live promotion pending.
