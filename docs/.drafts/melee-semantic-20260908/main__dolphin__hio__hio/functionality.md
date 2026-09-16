## Dolphin HIO service

The translation unit implements device enumeration, initialization, mailbox access, synchronous and asynchronous memory transfers, and raw status reads over EXI. Existing function names fit their canonical behavior; the rendered view contains no function-name substitutions and does not independently establish any naming hypothesis.

### Selection and initialization

`Chan` starts at exactly `-1`; `Dev` and three callback slots have static zero initialization. Enumeration requires `Chan == -1` and a non-null callback, resets `Dev` to zero, and scans channels 0–2 for ID `0x01010000`. Channels below 2 wait while `EXIProbeEx` returns zero, not specifically until a proven success state. A false enumeration callback stops scanning; every admitted scan returns true, including scans finding no device.

`HIOInit` checks DI configuration `0xFF` before its already-initialized test. The latter is `Chan != -1`, not a nonnegative/range check. New setup saves the channel and notification callback and clears transfer callback slots. Attachment is conditional on `chan < 2 && Dev == 0`. Identification uses a zero two-byte command and a four-byte response, accepting only `0x01010000`. Failure resets selection without rolling back callback assignments. Cleanup is asymmetric: lock/select failures detach, while identification failure conditionally detaches and calls unlock again after the earlier unlock. When `ExiCallback` is non-null, notification routing retains the explicit nonzero-Dev branch to EXI channel 2 even though this file has no nonzero Dev assignment; for `chan >= 2`, that notification setup registers interrupt `0x19` and unmasks `0x40`.

### Transactions

Mailbox reads send two bytes from `0x60000000` and receive four bytes; writes transmit `(word & 0x1FFFFFFF) | 0xC0000000`. Status reads use two bytes from `0x40000000` and return an uninterpreted four-byte response. Memory commands encode `((addr << 8) & 0x01FFFC00)` with read opcode `0x20000000` or write opcode `0xA0000000`. Memory APIs assert four-byte address alignment and forward buffer and size to EXI DMA without local buffer/size validation.

Operational APIs reject `Chan == -1` or DI configuration `0xFF`, then lock and select at frequency code 4. Selection failure unlocks. Synchronous paths accumulate failures without short-circuiting, attempt deselection and unlock, and return the inverse of the recorded errors; unlock is not included in that result.

### Deferred ownership and callbacks

Async calls overwrite their direction-specific callback before attempting the EXI lock. After selection, command, synchronization, and DMA calls are all attempted even if an earlier call reports failure. There is no inline post-selection teardown, including on a false return. Therefore false does not establish that no DMA was launched or that ownership was released.

`TxHandler` and `RxHandler` ignore their supplied channel/context and use the current global `Chan` for deselect/unlock before invoking the current saved callback. They neither clear the callback slot nor incorporate cleanup results into notification. These are shared slots, not per-request snapshots: rejected subsequent calls can overwrite a callback, and external removal resets `Chan` without clearing callback slots. Actual lower-level completion/cancellation guarantees remain outside this file.

`ExiHandler` conditionally forwards notification without arguments. `DbgHandler` writes `0x1000` to `__PIRegs[0]` unconditionally and, when a callback exists, runs it under a cleared temporary OS context before restoring the supplied context. `ExtHandler` unconditionally resets selection and clears the EXI callback only when its literal signed guard `chan < 2` holds.

### Review outcome

Inherited research covers all 337 canonical and rendered lines, all 47 subjects, and the empty link inventory. Independent lead reads verified every proposed fact's canonical citations and all upstream contradiction evidence. The ledger retains 57 supported facts, supersedes eight explanations, and leaves four compiled section identity/layout claims unresolved. Existing supported names and explanations are retained without equivalent-wording rewrites. Source declarations establish state roles and types but not exact compiled section membership, size, or ordering.

Status: synthesized; independent review and live promotion pending.
