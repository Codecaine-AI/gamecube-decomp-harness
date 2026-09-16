## MetroTRK serial packet intake
The complete canonical and rendered `serpoll.c` and `serpoll.h` were reviewed. Both rendered views contain zero substitutions and no parser errors. Existing function names fit their behavior; no rename is proposed.

`TRKTestForPacket` polls UART availability and, for a positive count, requests a message buffer. A successful read of at most `0x880` bytes sets the buffer length and returns its identifier. Oversized input causes repeated reads into the same scratch buffer, with requested batches capped at `0x880`, followed by a `kDSReplyNAK` reply carrying numeric error 6. Drain-read and acknowledgment results are ignored, so complete draining and successful transmission are not guaranteed. The allocation result is also ignored. Canonical source leaves `id` uninitialized when the polled count is nonpositive; allocation failure leaves the buffer pointer null and does not initialize the identifier. Consequently, this is not a uniformly safe rejection path.

`TRKGetInput` performs one packet test. After a non-`-1` result it retrieves the buffer, resets its cursor, reads the first byte, and forwards commands below `0x80` to `TRKProcessInput`; other commands release the buffer. It does not check the lookup or buffer-operation results. A `-1` result causes no additional work in this caller, but does not imply the packet-test call had no effects.

`TRKProcessInput` constructs numeric event type 2, independently identified as `kRequestEvent` by `nubevent.h`, attaches the supplied buffer identifier, clears the framing state's identifier, and attempts to post the event. Successful posting copies the stack-local event into the two-entry queue. The nub loop subsequently dispatches the request and destroys the event, releasing its buffer. Queue-full posting is unchecked and performs no local buffer cleanup; the framing reset is not rolled back.

Initialization writes only `fBufferID = -1`, `fReceiveState = 0` (`kWaitFlag`), and `fEscape = 0`; it does not explicitly reset `fBuffer` or `fFCS`. Termination simply returns success without cleanup. The persistent pending pointer is wired through nub initialization and read by the event loop. Source declarations and header offset comments do not establish compiled section ordering or extent.

Status: synthesized; independent review and live promotion pending.
