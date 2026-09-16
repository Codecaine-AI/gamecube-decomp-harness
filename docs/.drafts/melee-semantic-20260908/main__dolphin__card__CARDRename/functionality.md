## CARDRename

The unit provides asynchronous and synchronous Dolphin memory-card renaming. `CARDRenameAsync` validates filename prefixes and lengths, acquires the channel control block, and scans occupied directory entries matching the configured disk ID's game and company. It records source and destination matches independently: missing source takes precedence over destination collision, and renaming an existing file to itself returns `CARD_RESULT_EXIST`. The scan does not stop at the first match.

After source access validation, it copies `CARD_FILENAME_MAX` bytes with `strncpy`, updates the timestamp to OS time in seconds, and submits `__CARDUpdateDir` with the supplied callback. Maximum-length names are accepted; the copy does not independently append an extra terminator. Preflight failures after acquisition release the control block. Immediate update failure also releases it, but this function does not roll back the already-mutated directory entry. A nonnegative submission leaves completion to the directory-update path rather than releasing locally; this is not a guarantee of successful persistence.

`CARDRename` supplies `__CARDSyncCallback`, immediately propagates negative submission results, and otherwise returns `__CARDSync(chan)`. The baseline unit-purpose rationale incorrectly excluded this wrapper and is corrected. Existing asynchronous-function descriptions and memory-card concept links remain supported. No naming changes are warranted.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDRename.c#L7-L71 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDBios.c#L649-L696.

Status: synthesized; independent review and live promotion pending.
