## DVD command manager

This translation unit implements the high-level, callback-driven DVD command scheduler. Initialization binds boot information and the stored disc identity, initializes filesystem and waiting-queue services, installs the disc interrupt handler, and handles distinct JTAG and boot-ROM startup branches.

Public submission APIs populate caller-owned command blocks. Receive commands optionally invalidate their destination cache ranges before interrupt-protected queue insertion. The ready scheduler checks queue availability before pause state, rejects queued requests when the fatal latch is set, restores saved media-recovery conditions, or dispatches ordinary work. Absolute reads are issued in chunks of at most 0x80000 bytes. Completion accumulates bytes using the hardware residual count and can accept a fully transferred receive command even on the device-error branch. Audio address queries multiply the hardware result by four; stream initialization has a two-stage path that can finish as IGNORED with callback result -2.

## Recovery and cancellation

Error interrupt causes, raw drive errors, classification results, command states, and saved resume selectors are separate numeric domains. Classification preserves the exact raw 0x20400 special case, low-24-bit media codes, and second-attempt repeated-error handling. The category-3 corrective-seek branch exists in source, but its 0x31100 condition is not reached through the current classifier, which assigns that code category 1 or 2.

Cover recovery either clears waiting work and reports -4 for special command classes without assigning END to the retired block, or resets the drive, waits 1150 milliseconds, resets again, and reads the inserted disc ID. Identity checking compares 0x1C bytes for a requested replacement disc versus 0x20 bytes for the current disc. An accepted replacement leads to metadata and FST loading; an accepted current disc leads to audio-buffer restoration and resumed execution.

Cancellation may acknowledge immediately, remove waiting work, or reserve a single deferred cancellation callback. Command callbacks receive -3 for cancellation, while cancellation-request callbacks receive 0. Motor-wait cancellation does not install DummyCommandBlock before callbacks. Clearing an unexpected low-level callback can reject cancellation after the callback slot has already been cleared. Synchronous wrappers sleep on the shared DVD thread queue and recheck command-specific conditions; a wake does not itself prove completion. The filesystem synchronous read wrapper separately maps canceled state to -6.

Reset clears reset-required and resume bookkeeping, not the fatal latch. Timeout records a dedicated diagnostic, resets the drive, and enters fatal finalization; subsequent ready-state processing rejects queued work. Reset preparation always clears the waiting queue, but suppresses the active command's ordinary callback only when cancellation was not already pending. The reboot caller retains its command blocks while waiting for preparation and apploader reads.

## Evidence and naming assessment

Full source, rendered, subject, fact, and link coverage is inherited from the hash-bound research handoff. The lead independently inspected every proposed fact's canonical citations and the upstream contradiction evidence. The rendered view reports no substitutions or parse errors; existing function names remain appropriate. Supported existing knowledge is explicitly retained through the inherited ledger. Source declarations and C switches do not establish compiled section membership, object order, or jump-table representation, so section-target claims remain unresolved rather than being treated as proven layouts.

DVDGetCurrentDiskID exposes shared stored boot identity without issuing a hardware read. Its memory-card consumer uses the company and game identifiers to filter snapshot files. This stored identity must not be confused with an immediate measurement of the currently inserted medium.

Status: synthesized; independent review and live promotion pending.
