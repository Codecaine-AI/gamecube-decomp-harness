## MCC FIO client

This translation unit implements a singleton remote-file client over MCC. It provides initialization, shutdown, peer querying, open/close, synchronous and asynchronous reads/writes, seeking, formatted output, flushing, metadata/error queries, and directory searches. Existing function names fit their canonical behavior; no function rename is warranted.

### Packet and storage lifetime

`gBuf` is an 8192-byte shared packet workspace. Header construction places MCC and FIO headers at offsets 0 and 8 and returns payload storage at offset 16. It increments a wrapping `u32` request sequence and optionally byte-swaps header fields. Construction happens before the sender's busy/done waits, so these waits do not make packet construction reentrant-safe. Response pointers borrow this same storage and become invalid as stable contents when it is reused. Sending writes full 8192-byte blocks and notifies the peer; receiving waits up to ten seconds, reads one block, validates operation and sequence, and conditionally releases the busy flag. Send failures do not themselves release that flag. The multi-block sender copies another block even after its last write.

### Lifecycle and exceptional results

Initialization performs MCC initialization and channel opening before its explicit success-state assignments; failed initialization does not roll back prior MCC work. Shutdown resets its listed globals only after successful close. Neither lifecycle function resets the request sequence, saved asynchronous byte count, or stream-ready latch. Query failures incur an additional five-second busy wait, including calls with no active channel.

Open returns a remote descriptor only for a zero peer result. Close instead returns 1 for any nonnull validated response and stores the peer status separately in the last-error byte. Synchronous writes validate handle and buffer before the zero-length early return; that early return preserves the last error and precedes the asynchronous-busy guard. Negative write-helper results become error 0x83. Metadata and directory-search routines copy response structures before testing the peer result. Formatted output uses unbounded `vsprintf` into its static buffer before truncating the resulting string to 255 characters, and includes its terminating NUL in the write.

### Asynchronous and stream behavior

Asynchronous dispatch retains the caller buffer and direction and sets state 1 before sending. A completion notification changes any nonzero asynchronous state to 2. `FIOCheckAsyncDone` accepts either nonzero state, not only state 2: with a result pointer it runs the potentially blocking transfer/result helper; without one it skips that work but still clears the asynchronous state and returns 1. Dispatch failure does not roll back the retained busy state.

Read-result processing handles a rounded fractional transfer first, then may close the ordinary channel, open a stream, transfer full allocations, and reopen the ordinary callback channel. Its successful return is the requested size rather than the response's `nbytes`. Write-result processing rounds the byte count to 8192-byte blocks, retries stream opening after polling state 0, waits for state 3 before writing, then waits to leave state 3 and subsequently leave state 0 before reopening the ordinary channel. These numeric predicates must not be normalized into a conventional reconnect sequence. Several write-side transport failures only log diagnostics and still reach final response handling; a zero peer result supplies the returned byte count.

### Cross-file use and evidence limits

The screenshot path obtains framebuffer storage, constructs a numbered `USB:shot/screenshot%02d.frb` name, and forwards the buffer to the Sysdolphin host-export routine. That routine queries FIO, opens the host file, writes synchronously, compares the returned count, and closes the descriptor on both post-write branches. This confirms the retained screenshot/export association.

All canonical and rendered lines were reviewed. Rendering performed no substitutions and reported no parse errors; `fioPacketMakeHeader` and `fioPacketReceiveResult` were marked `shadowed_binding`, so their canonical definitions supply the evidence. Source declarations do not establish compiled section membership, size, ordering, or padding; the corresponding baseline layout claims remain unresolved.

Status: synthesized; independent review and live promotion pending.
