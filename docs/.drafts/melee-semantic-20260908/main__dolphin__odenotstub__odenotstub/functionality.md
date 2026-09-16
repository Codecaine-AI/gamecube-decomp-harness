## ODE debug-communication backend

This translation unit implements the synchronous EXI-backed DB communication API selected by MetroTRK for HARDWARE_NDEV. The canonical caller installs its initialization, interrupt, query, read, write and lifecycle functions in the communications table; Hu_IsStub always returns zero, identifying a non-stub implementation rather than probing hardware availability. See code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/dolphin_trk_glue.c#L66-L120.

### Transfers and protocol

The low-level helpers select an EXI endpoint, pack or unpack immediate-transfer bytes in high-byte-first order, and spin until the transfer-start bit clears. Mailbox/status reads issue two-byte commands and receive sizeof(pointer) bytes, interpreted as one word on the target ABI. Payload helpers encode masked device addresses and transfer complete u32 words. Their error accumulation and early-return branches exist syntactically, but the local select, deselect, immediate and synchronization primitives return TRUE whenever they return; they provide no timeout or hardware-error report. See code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/odenotstub/odenotstub.c#L17-L179.

### Receive state and callback lifetime

DBInitComm exports the address of the static byte flag and stores the monitor callback. DBInitInterrupts connects vector 0x19 to DBGHandler and MWCallback. The handler writes 0x1000 to the PI register before optional dispatch; MWCallback sets the flag before optionally invoking the stored monitor callback with literal interrupt value zero and the original context. These callbacks and the exported flag remain installed across reads and the no-op open/close hooks.

Mailbox polling tests status bit 0, strips the top three mailbox bits, accepts tag 0x1F000000 and records the low 15-bit length. DBQueryData clears the flag on every invocation and polls only when the retained length is zero. A valid zero-length descriptor can set the flag without establishing a nonzero pending length. Critically, when a nonzero length is already pending, the source passes an uninitialized local to OSRestoreInterrupts. DBRead does not validate pending state or bound the caller's requested size by the retained length: it selects 0x1E000/0x1F000 from mailbox bit 16, performs the rounded transfer and unconditionally clears the length and flag. See code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/odenotstub/odenotstub.c#L181-L256.

### Output and exceptional cases

DBWrite disables interrupts, polls status bit 1, increments the byte-sized SendCount, alternates payload banks 0x1C000/0x1D000, transfers the rounded payload and publishes sequence/tag/raw size through the mailbox. Its first two status loops ignore the helper's BOOL; the final loop checks it. All waits are unbounded. Size is ORed into the descriptor without field validation, so large values can overlap metadata. Four-byte rounding can wrap in unsigned arithmetic, and passing the result to signed helper lengths does not validate its range. Buffers must accommodate full-word accesses, including padding beyond a non-word logical length. See code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/odenotstub/odenotstub.c#L258-L289.

DBOpen and DBClose are empty. DBInitInterrupts is declared int but has no return statement; no defined status should be inferred from it. Source declarations establish persistent object types, not compiled section order, extent or padding.

### Semantic review

Both canonical and rendered views were reviewed through line 298. The renderer reported no parse errors and made no function-name substitutions; parameters and section labels were outside its substitution coverage. Existing function names fit the canonical operations. Retained baseline facts and all three links are explicitly accounted for in checkpoints. Corrections address unchecked signed length assumptions, query-state exceptions and the status helper's output-polling role; one missing return-contract fact is added.

Status: synthesized; independent review and live promotion pending.
