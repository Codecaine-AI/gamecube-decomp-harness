## OSExi

Implements the Dolphin OS three-channel External Interface driver: interrupt masking and dispatch, immediate and DMA transfer initiation, synchronous completion, device selection, lock arbitration, removable-device probing, attachment monitoring and device identification.

`Ecb[3]` retains callbacks, immediate receive buffers, ownership, waiter queues and cached identification across API calls and interrupts. State masks are `0x1` DMA busy, `0x2` immediate busy, `0x4` selected, `0x8` attached and `0x10` locked. These masks must not be confused with ordinal bit numbers. Source declarations do not establish compiled section identity or layout.

Immediate transfers pack and unpack most-significant bytes first. DMA starts return acceptance rather than completion. TC interrupts finalize transfers only when a callback exists; polling can also finalize them. `EXISync` tests selection, not busy state, and may invoke the completion helper after interrupt completion. The helper's busy guard prevents repeated receive copying. Sync suppresses success for the exact conjunction of DI configuration `0xff`, retained immediate length four, frequency encoding zero and data `0x01010000`.

Selection on channel 2 bypasses the secondary ownership and presence checks. Selecting an attached device masks EXT notification; deselection restores it and may subsequently report failed presence despite already clearing selection. Attachment acknowledges the EXI cause, not EXT. Unlock removes one FIFO waiter and invokes it before restoring interrupts; notification does not automatically grant ownership.

Unattached removable channels qualify presence using three differences of a quantized 100-ms counter. Attached channels instead test presence and external-event status without repeating the timing check. Channel 2's low-level probe returns true. Identification caches device-zero results on channels 0/1 by probe timestamp, registers a deduplicated deferred retry on contention, accumulates transaction errors without short-circuiting, and ignores unlock/detach return values.

HIO demonstrates the cross-file lifetime: asynchronous DMA retains ownership and selection until its completion handler deselects and unlocks, then notifies its client. CARD source confirms probe integration, but CARDProbe lacks an explicit return on its EXIProbe path; no compiled return-propagation claim is made.

All 704 canonical and rendered lines, all 73 frozen subjects and all 29 links were reviewed. Supported knowledge is explicitly retained in checkpoints. Six factual corrections are proposed; equivalent names and explanations are left unchanged. The renderer reports one parse error and zero substitutions, and its foreign binding for local CompleteTransfer is not accepted as canonical evidence.

Status: synthesized; independent review and live promotion pending.
