## Dolphin CARD shared interface

This header defines `CARDCallback(chan, result)` and the source-level structures for file information, directory entries, card control, decoding parameters and card identification. Directory comments specify a timestamp epoch of midnight January 1, 2000 and unused icon/comment address sentinels of `0xffffffff`. The control structure contains operation state, transfer buffers, directory/FAT pointers, callbacks, a thread queue and an alarm; declarations alone do not establish ownership or cross-file lifetimes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/card.h#L12-L101.

It re-exports CARD operation headers and defines permission flags, FAT constants, storage limits, speed codes and result codes. `UNLOCKED` is 1, `READY` is 0, `BUSY` is -1, and the remaining named results are negative; this header does not establish operation-specific transitions or callback behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/card.h#L103-L165.

`CARDIsValidBlockNo` tests the range `[5, card->cBlock)`. Banner format extraction masks the low two bits; icon extraction shifts by twice the requested index and masks two bits, without an explicit index check. `CARDGetDirCheck` casts the address of directory element 127. The header also declares initialization, result-query, asynchronous check/rename/format and free-space interfaces. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/card.h#L167-L201.

All canonical and rendered lines were reviewed. No semantic correction is warranted, and there are no baseline subjects, facts or links to retain or revise. Rendered names are unchanged. Source offset comments are not treated as compiled-layout evidence.

Status: synthesized; independent review and live promotion pending.
