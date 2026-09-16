## MetroTRK outbound message adapter

`TRKMessageSend` forwards `msg->fData` and `msg->fLength` directly to `TRK_WriteUARTN` and returns its `DSError` unchanged. It performs one unconditional transport call, with no local validation, retry, timeout, buffer release, or state transition. The existing function name and explanations fit both canonical source and the unchanged rendered view. All seven existing facts and both links are retained; no semantic rewrite is warranted.

The transport boundary matters: `TRK_WriteUARTN` maps its selected backend's zero/nonzero result to `kNoError`/`kUARTError`; this wrapper does not perform that mapping itself. The UART-named interface can dispatch through DBWrite or EXI2_WriteN, so the existing UART terminology identifies an interface rather than exclusive physical UART hardware. A synchronous call does not establish physical delivery or remote acknowledgement. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msg.c#L5-L8 and code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/dolphin_trk_glue.c#L66-L90 and #L117-L121.

Retry and reply lifetimes belong to callers. `TRKSendACK` makes up to three attempts, stopping on success. `TRKRequestSend` supplies retransmission and reply polling; its polling limit is optional, transport errors stop further attempts through the loop condition, and invalid/error replies are released there rather than in `TRKMessageSend`. A retained valid reply remains represented by the returned buffer ID. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msghndlr.c#L28-L49 and code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/support.c#L116-L196.

The header declares the adapter and defines `TRKPacketSeq` with still-unknown fields. Its offset/size comments are source annotations, not independently verified compiled-layout evidence. No field semantics or rename is inferred from the type name alone. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msg.h#L9-L14.

Status: synthesized; independent review and live promotion pending.
