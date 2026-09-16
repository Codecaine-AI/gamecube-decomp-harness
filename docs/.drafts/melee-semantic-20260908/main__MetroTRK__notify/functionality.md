## MetroTRK notification path

`notify.c` implements `DSError TRKDoNotifyStopped(u8 cmdId)`; `notify.h` declares that same interface. Both canonical and rendered files were read completely. Rendered function names remain unchanged, with no substitutions or parse errors. The established name is retained; its broader exception behavior is already documented.

The function obtains an outbound message buffer and pool index. Allocation failure returns immediately without sending. After allocation, it appends the command byte; only a successful append permits payload construction. `kDSNotifyStopped` selects stopped-target information, while every other command value selects exception information, without further command validation. The stop serializer's error result is ignored; the exception serializer returns void and can stop constructing its payload after an internal error.

Regardless of construction success, the allocated-buffer path calls `TRKRequestSend(buffer, &sp8, 2, 3, 1)`. The helper establishes a minimum reply length of two bytes, one initial send plus up to three retries, and enabled polling timeout handling. It processes incoming non-reply commands while waiting and accepts only a no-error ACK. These are polling bounds, not evidence of a specific elapsed-time duration or unconditional wall-clock completion bound.

An accepted ACK remains allocated for this caller to release. Rejected replies are released by the request helper. This function releases the returned ACK buffer on request success and releases its outbound buffer after every request attempt. The request result overwrites construction status and becomes the return value after successful allocation. Completion does not require successful delivery: a failed exchange can return `kWaitACKError`.

The inspected caller handles breakpoint and exception events by marking the target stopped and sending `kDSNotifyStopped` when debugger stepping does not consume the event. This is remote-debugger infrastructure, not gameplay. Existing lifecycle and mapping knowledge and both concept links remain supported. Only the function-purpose statement needs correction because it implies successful acknowledgement is necessary before completion.

Evidence: [notification implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/notify.c#L7-L37), [public declaration](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/notify.h#L1-L10), [request exchange](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/support.c#L116-L196), and [caller and serializers](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/targimpl.c#L806-L874). No compiled section or layout claims are made.

Status: synthesized; independent review and live promotion pending.
