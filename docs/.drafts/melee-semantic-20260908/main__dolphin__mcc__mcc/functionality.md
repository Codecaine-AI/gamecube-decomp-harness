## MCC transport

This unit implements Hudson USB2EXI communication over HIO: session establishment, a sixteen-entry shared channel table, allocation in 8 KiB blocks, mailbox control messages, application notifications, synchronous/asynchronous transfers, and callback-paced streaming. Channel zero carries system messages; public data-channel operations generally accept channels 1–15. Existing canonical function names fit their behavior; the rendered view supplied no alternative name substitutions.

### Metadata and allocation

LoadChannelInfo reads the 0x40-byte descriptor image at HIO address 0x700 only while dirty, copying only each runtime record's info member and preserving local callbacks, masks and stream bookkeeping. Its byte counter permits 256 failed reads; FlushChannelInfo permits sixteen failed writes. Publication marks the cache dirty and sends system event 5, so it can report failure after the table was already written. Channel mutations are not rolled back when flushing fails. MakeMemoryMap reserves block zero; SearchFreeBlocks implements minimum-run, maximum-run and total-free policies, retaining the earliest equal-sized run. Its terminal condition accesses map[16] before testing the sentinel index, and minimum mode retains its initial result 16 when no free run is encountered.

### Mailbox and lifecycle

Mailbox words encode notification bit 28, channel bits 24–27 and a low-24-bit value. System messages update initialization, session, ping and cache state. Numbered-channel notifications become callback event 0x100; ordinary events 1, 2, 4, 8, 16 and 32 are forwarded, internal events 0x40/0x80 are ignored, and unknown values become event zero. Incoming dispatch does not consult eventMask. Set mask bits instead suppress generated peer events and local completion callbacks.

Initialization distinguishes HOST-code detection, local initiation and reuse of existing initialization state. A zero timeout skips the peer wait; success does not universally mean both lifecycle flags are active. HOST-code read failure is indistinguishable from a nonmatching code. MCCExit requests channel closes but ignores their results, clears lifecycle flags and does not release HIO's selected-channel/callback ownership.

### Transfers and streaming

Read/write translate offsets using firstBlock << 13, check four-byte offset alignment and 32-byte buffer/size alignment, and use invalidate/flush cache operations respectively. Only writes reject the channel lock. The implemented range checks are not proof against negative sizes or addition overflow. One packed asynchronous resource stores busy/done state, mode and channel. HIO completion handlers deselect/unlock before invoking MCC callbacks; those callbacks only mark done. MCCCheckAsyncDone later clears the resource before dispatching masked completion events. Failed asynchronous submission has no MCC-side busy-state rollback.

Streaming sends a 32-byte header containing a block count and waits on event latches in five-second phases. Connection latches also respond to close event 2 and are not equivalent to current connection state. Every payload write uses full channel capacity, including the final iteration; reads can shorten the final chunk. MCCStreamClose clears its marker before delegated validation and has no return statement despite its int declaration and FIO callers testing its result. FIO temporarily replaces ordinary channel callbacks with stream callbacks and later reopens the ordinary channel.

### Review limitations

All owned canonical/rendered pages, all 84 subjects and all fourteen links were reviewed. The renderer reports one parse error and marks the MCCClose region parse_uncertain. Source comments do not establish compiled section layout; exact BSS aggregation and handshake-string placement remain unresolved. The empty mccDebugPrint hook produces no observable diagnostic output.

Status: synthesized; independent review and live promotion pending.
