## Serial Interface driver

OSSerial implements four-channel GameCube SI communication, separating explicit command/response transfers from automatic polling. Existing canonical function names fit their roles; no renaming is proposed. All canonical and rendered pages were reviewed. The renderer made no substitutions and reported 362 parse errors, so its unchanged names are not independent semantic evidence.

### Explicit transfers

`Si.chan == -1` denotes an idle explicit-transfer engine. `SIBusy` observes only that singleton; `SIIsChanBusy` additionally observes the selected channel's pending packet. `SITransfer` accepts at most one pending request per channel, rejecting a channel already active or queued. A nonzero delay is measured from that channel's previous completion time, not from the current call. Accepted requests either start immediately or retain caller pointers, lengths, callback and eligibility time in `Packet`.

`__SITransfer` stages outgoing data with rounded-up word reads, retains the input destination and callback, encodes 128-byte lengths as zero, and starts hardware. Callback presence controls the transfer-complete interrupt mask. `CompleteTransfer` acknowledges completion, copies whole words and trailing high-order bytes, records timing, normalizes active-channel errors and releases the engine. With no active channel it returns the initially read status register without response processing. Both `SIInterruptHandler` and `SISync` invoke it. In the interrupt path, eligible queued work is considered **before** the completed request's saved callback runs.

The alarm handler removes a pending packet only after a successful hardware start. Its assertion references the local `packet` pointer before assignment; whether that expression executes depends on assertion configuration. It is not established to be a null pointer.

### Polling and commands

`SISetCommand` stages a per-channel command; `SITransferCommands` performs the separate submission write. PAD motor routines demonstrate the rumble use of this generic interface. `SISetXY` changes cached polling timing without directly writing hardware. Enable/disable routines commit the aggregate polling image and treat a zero channel mask as a query.

`SIGetResponseRaw` captures two response words when RDST is present, preserving an existing response latch otherwise. Its status query can independently update the type cache. `SIGetResponse` refreshes, snapshots and clears the validity latch under interrupt exclusion, copying two words only when valid. Polling interrupts attempt capture on every channel, then require sufficiently recent nonzero video-line timestamps only for enabled channels before clearing timestamps and dispatching handlers.

The four-slot polling registry checks the entire table for duplicates before insertion. Null registration succeeds without insertion when a vacancy exists. Null unregistration can match an empty slot and return true without removing a live subscriber; an entirely empty resulting table causes polling interrupts to be disabled.

### Identification and wireless continuation

`SIGetType` preserves its polling exception and 50/75 ms cache policy. In the intermediate refresh window it can return the old local value while marking `Type[chan]` busy. Its 65-microsecond transfer argument uses the preceding-completion spacing rule. Submission results are not checked by these type-query paths.

`SIGetTypeAsync` either invokes its callback immediately under interrupt exclusion or scans four deferred slots. Equality and vacancy tests are interleaved: a first vacancy ends the scan, so a later duplicate is not necessarily detected. Full-table exhaustion silently leaves a new callback unregistered. Dispatch clears each slot before invoking it, permitting reentrant table changes.

`GetTypeCallback` merges errors, timestamps the cache and consumes the channel's PAD fix bit. It preserves the distinct transport-error, inapplicable-device, forced-fix, mismatched-fixed-ID, newly-received-ID and unreceived-device branches. Wireless retries use persistent command buffers and defer final notification. PAD independently consumes the shared fix mask and uses SI results for origin acquisition, probing, connection checks and controller polling.

### Evidence limits

Source declarations establish object roles, not compiled section membership, byte extents, ordering, string alignment or padding. All 15 section-target facts and three section-target links remain unresolved at that attribution boundary; their supported source-level behavior is preserved above and in the dispositions. In particular, the baseline assigns the interrupt-local command to both `.data` and `.sbss`. The final `dummy` routine references peripheral labels but does not implement numeric type-to-string decoding or prove those literals survive compilation.

Status: synthesized; independent review and live promotion pending.
