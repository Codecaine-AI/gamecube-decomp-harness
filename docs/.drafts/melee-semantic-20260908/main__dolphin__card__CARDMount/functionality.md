## CARDMount semantic review

This unit implements lightweight and extended memory-card probing, asynchronous mounting, the synchronous CARDMount wrapper, and guarded unmount cleanup for two CARD channels. Existing function names fit their canonical roles; the rendered view makes no function-name substitutions.

### Probe and geometry
CARDProbe suppresses hardware probing when GameChoice bit 0x80 is set. Otherwise it calls EXIProbe, but the canonical C body has no explicit return on that path. Snapshot polling consumes its result, establishing intended use rather than proving compiled return behavior. CARDProbeEx distinguishes absent, busy, compatible and wrong-device states, returning optional cached geometry once an attached card reaches mountStep >= 1, or decoding geometry from an unattached device ID. Probe READY does not imply completed mounting or geometry validation.

SectorSizeTable and LatencyTable decode device-ID bits into geometry and timing. DoMount computes cBlock by dividing by sectorSize before checking whether sectorSize is zero; its later invalid-geometry branch is not evidence of safe zero-size handling. The source declares two static u32[8] arrays, but does not establish their compiled section size, adjacency or placement.

### Mount progression and lifetimes
CARDMountAsync stores the caller's workspace and callbacks, reserves the channel as busy, attaches removal handling if needed, and resets mount/cache state. Failed EXIAttach leaves the stored workspace and callback assignments in place while changing the result to NOCARD. EXI lock contention returns READY with a continuation installed: this is accepted deferred startup, not completed mounting.

DoMount identifies the device, derives geometry, checks status, and either initiates unlocking and saves a 12-byte flash identity plus complemented checksum, or validates the saved checksum. Step 1 performs vendor validation only for device ID 0x80000004, enables interrupts, releases EXI and invalidates the workspace. Subsequent reads use mountStep - 2 to select card-sector addresses and workspace slices. The workspace remains stored in CARDControl beyond the initial call; unmount does not clear it or the directory/FAT pointers.

__CARDMountCallback increments the step for READY, resumes without incrementing for UNLOCKED, and verifies after the read sequence. Incoming IOERROR and NOCARD explicitly unmount. Other terminal results, including verification results, reach notification without a second switch-based unmount decision. Terminal notification saves and clears apiCallback, releases the control block, then calls the saved callback. Immediate setup errors instead unlock EXI and call DoUnmount; immediate read-start errors release the control block. These paths must not be collapsed into a universal callback or teardown guarantee.

### Unmount and integration
DoUnmount changes state only while attached, removing the EXI callback, detaching monitoring, cancelling the alarm and storing the supplied result while resetting mountStep. CARDUnmount first acquires the control block and propagates acquisition failure; success stores NOCARD through teardown but returns READY. CARDBios confirms busy reservation, conditional result publication and reset-time unmount attempts. CARDMount waits through __CARDSync only after nonnegative asynchronous startup.

The review retains 46 existing facts and all 10 links, and proposes three focused factual corrections. Fourteen parameter subjects have no baseline facts; existing function descriptions already explain their useful roles.

Status: synthesized; independent review and live promotion pending.
