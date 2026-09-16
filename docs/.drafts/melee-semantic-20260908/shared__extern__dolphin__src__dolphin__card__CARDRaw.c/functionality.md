## CARDRaw.c
The existing names `__CARDRawReadAsync` and `__CARDRawRead` accurately describe asynchronous raw reading and its synchronous wrapper. The rendered view makes no substitutions; no semantic correction is warranted.

`__CARDRawReadAsync` asserts a non-null, 32-byte-aligned buffer, then acquires a control block. On a negative acquisition result, it returns `__CARDPutControlBlock(card, result)` directly—an exceptional branch whose pointer validity and return semantics depend on the external helpers. After acquisition, it asserts positive length, divisibility by `CARD_SEG_SIZE`, length below `CARD_MAX_SIZE`, and offset divisibility by the card's sector size. These are assertions, not explicit error-return checks. It invalidates the destination cache range and passes the channel, offset, length, buffer, and callback to `__CARDRead`. A negative read-start result triggers control-block release, but the function returns the original read result rather than the release result. No local release occurs on a nonnegative result; subsequent completion and control-block lifetime are delegated outside this file. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDRaw.c#L6-L24)

`__CARDRawRead` supplies `__CARDSyncCallback`, immediately propagates a negative asynchronous-start result, and otherwise returns `__CARDSync(chan)`. The source distinguishes negative from nonnegative status without establishing specific numeric error meanings. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDRaw.c#L26-L33)

All owned canonical and rendered lines and all baseline subject/link pages were reviewed. There are no baseline facts, links, or writable subjects; the proposal is empty.

Status: synthesized; independent review and live promotion pending.
