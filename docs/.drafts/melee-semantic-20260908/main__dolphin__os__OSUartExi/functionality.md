## OSUartExi semantic review

The canonical and rendered file were reviewed completely. The renderer reported no parse errors and made no substitutions; existing function names remain appropriate.

- `InitializeUART` tests console-type bit `0x10000000`, storing zero and returning 2 when absent, or storing `0xA5FF005A` and returning 0 when present. It initializes software availability, not EXI hardware. `WriteUARTN` validates that cookie using target-width unsigned arithmetic.
- `ReadUARTN` is a state-independent stub returning 4 without transferring data. This is failure to its MSL caller; no symbolic error-code identity is established here.
- `QueueLength` selects EXI channel 0/device 1 with selector argument 3, sends `0x20010000`, reads one response byte, deselects, and calculates `16 - (cmd >> 24)`. Selection failure returns -1. Immediate-transfer and synchronization results are not checked.
- `WriteUARTN` returns 2 for an invalid cookie. Lock failure returns 0 without touching the buffer or transmitting. After acquiring the lock, it converts all requested LF bytes to CR in place, even if a later operation fails. It polls until free capacity is at least 12 bytes or sufficient for the remaining payload, sends `0xA0010000`, and transfers chunks of at most four bytes. The inner loop stops when fewer than four queue slots remain unless they suffice for the remaining payload. Queue/select failures produce -1; acquired-lock paths that return unlock first. Polling has no timeout, and ignored transfer results mean zero is not proof of successful physical delivery. A zero-length enabled request still attempts the lock but performs no queue transaction.
- Canonical MSL callbacks share a separate successful-initialization latch and pass `0xE100`, which this initializer does not consume. MSL output treats the lock-failure zero result as success. MSL input increments its attempted-byte count and inspects the destination byte despite this read stub returning failure without writing it. Its `const void*` write declaration does not describe the backend's actual mutable-buffer requirement.

The historical comment that these routines were unused is not evidence that source callers are absent: MSL contains explicit calls. Runtime reachability and compiled storage placement remain unproved. Source-level cookie behavior is retained, but `.sbss` identity/layout claims are not inferred from the C declaration.

Status: synthesized; independent review and live promotion pending.
