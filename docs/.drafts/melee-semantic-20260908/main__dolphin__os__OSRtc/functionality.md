## OSRtc semantic review

Reviewed all 473 canonical and rendered lines, all 29 subjects, 85 facts and 20 links. Retained 81 facts and all links explicitly in checkpoints; four factual corrections are proposed below. Existing function names fit their behavior. The renderer made no substitutions and reported no parse errors; its unrelated `callback` candidate was correctly suppressed as a shadowed binding.

### Peripheral interface
- RTC transactions use EXI channel 0/device 1. `__OSGetRTC` attempts up to 16 pairs of reads, accepting only an equal pair and stopping on transaction error. RTC writes send a command followed by the supplied value.
- SRAM initialization invalidates and DMA-loads 64 bytes into `Scb`, records the read result, asserts success and initializes the dirty boundary to `0x40`. A failed read is not made successful by that assertion.
- Synchronous ROM reads perform command/DMA/synchronization and cleanup. Asynchronous reads store a single callback before admission and leave completion cleanup to `__OSReadROMCallback`, which deselects/unlocks EXI and clears the callback slot before invocation. Admission failure leaves the stored callback intact; after selection, accumulated transfer errors do not cause local cleanup. Thus the asynchronous return is not a completion guarantee, and the caller's DMA destination must remain valid through completion.

### SRAM lifetime and persistence
`LockSram` disables interrupts and retains the prior interrupt state across the caller's access. Nested acquisition asserts and, if execution continues, restores this attempt's interrupt state and returns NULL. The setting accessors do not check that result.

A noncommitting unlock releases the lock and restores interrupts without rolling back cache edits. A committing unlock performs base-record normalization and paired additive checksums only when the **supplied offset** is zero. It then folds that offset into the retained minimum dirty boundary and attempts to write the suffix ending at `0x40`. An extended commit can therefore include an earlier dirty base range without regenerating base checksums again.

`WriteSram` encodes the byte offset into the peripheral command and sends the payload through synchronized immediate chunks. EXI contention registers a device-deduplicated unlock notification; the callback retries the current retained dirty range rather than a captured historical buffer. Selection or transfer failure is not itself a promise of a queued retry. Success resets the dirty boundary; failure preserves it. `__OSSyncSram` only observes the latest result and neither initiates nor waits for I/O. Both public unlock wrappers declare `int` but omit an explicit return; no compiled return-value guarantee is inferred.

### Settings and consumers
Sound, progressive, video, language, boot-mode and wireless-ID accessors use the cache and avoid committing unchanged requests. Progressive mode uses only input bit zero; its getter returns a stored preference, not hardware capability. Startup separately checks DTV capability and the B-button override. Wireless accessors have no local channel bounds checks; SI reconciles their saved packed IDs before delivering status used by PAD initialization. Reset uses base SRAM to persist a force-menu flag and polls synchronization; DVD error handling commits compact metadata through extended SRAM.

No compiled section size, layout or placement is established by this source review.

Status: synthesized; independent review and live promotion pending.
