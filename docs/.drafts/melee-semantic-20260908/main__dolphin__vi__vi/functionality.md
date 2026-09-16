# VI semantic review

The translation unit implements Dolphin video-output initialization, timing selection, geometry and framebuffer register construction, deferred hardware updates, retrace callbacks/waits, and raster/status queries. All 1023 canonical and rendered lines were reviewed, along with all 46 subjects, 111 facts, and 33 links. The rendered view made no substitutions and reported no parse errors; existing function names fit their canonical roles. No renames are proposed.

## State and lifetime

Configuration and setters edit `HorVer` and `regs`, marking register indices dirty. `VIFlush` coalesces dirty entries into `shdwRegs` and requests application; it does not write hardware. Retrace processing attempts the commit after the pre-callback. A change is deferred precisely when `changeMode == 1` and the field indicator is zero. Successful application publishes timing and TV mode from live `HorVer`, not from a separately snapshotted timing object. The post-callback and waiter wakeup still occur when a commit is deferred. HSD's pre-callback selects and flushes XFB state, while its post-callback advances XFB ownership or performs a deferred copy.

The handler acknowledges four interrupt sources; either of the latter two sources causes an early return without retrace counting, callbacks, or waiter wakeup. Callback setters sample the previous callback before disabling interrupts, protect the replacement write, and restore the prior interrupt state. `VIInit` also clears both registrations.

## Timing, geometry, and exceptional paths

`getTiming` returns borrowed pointers into eight static records, with numeric aliases and a NULL default. Its callers dereference the result without a fallback check. The canonical evidence for the retained lookup group is code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/vi.c#L257-L337; this corrects the accidentally shortened revision component in that checkpoint group's locator.

`VIConfigure` distinguishes scan values 1, 2, and 3; these must not be conflated with similarly valued TV-format constants. `__VIInit` literally extracts `mode & 2`, whereas the ordinary non-interlace scan constant is 1. Philips-specific branches exist, but this revision's encoder helper always returns 1.

Framebuffer calculation accounts for pan offsets, field layout, display-origin parity, and address masking. Right-eye addresses are recomputed only in 3D, yet all four stored addresses participate in representation selection and may be shifted even outside 3D. Vertical staging uses an `equ >= 10` threshold, swaps field baselines for odd origins, and suppresses active video for black output. Callers differ in whether they pass adjusted or unadjusted display height.

`VIInit` imports only the horizontal SRAM offset and resets the vertical offset to zero. It establishes software black state but does not necessarily black out already-enabled hardware. `VIWaitForRetrace` returns normally after observing a changed counter; void-returning is not non-returning. Raster queries preserve the exact numeric field domain rather than assigning unsupported odd/even labels.

`VIGetTvFormat` maps supported current modes to 0, 1, 2, or 5, but its source assertion references an uninitialized local and its switch has no default assignment. Code 5 is not uniformly accepted downstream: GX takes its default path, PAD panics, and HSD's period accounting treats every non-NTSC result as 50.

Supported knowledge and all links are explicitly retained in the checkpoint ledger. Eight fact corrections are proposed. Exact compiled section extents/membership and the broader archived PAL retail-behavior claims remain unresolved rather than being inferred from source declarations or rendered names.

Status: synthesized; independent review and live promotion pending.
