## Low-level DVD command execution

`dvdlow.c` implements the hardware-facing DVD layer beneath `dvd.c`'s request scheduler. It issues disc reads, seeks, disc-ID reads, inquiry, error/status requests, drive-audio commands and motor-stop commands through DI registers, retaining an asynchronous callback and ordinarily arming a ten-second timeout. Data reads larger than `0xA00000` bytes use twenty seconds. Cover waiting does not arm a timeout. Hardware reset instead performs a synchronous PI-register pulse lasting at least twelve microseconds.

## Read sequencing and persistent state

The three-entry internal command list is a workaround sequencer, not the higher-level DVD request queue. Command values `1` and `2` dispatch read and seek; `-1` terminates the sequence. Mode `0` reads directly. Mode `1` can issue a direct read, defer it with an alarm, or issue two preparatory seeks before the original read. The first seek is immediate; the second seek and read are queued. Other mode values update request metadata and DI length but return `TRUE` without dispatching or queuing a new command.

`Curr.bootFilePosition`, `Curr.FSTPosition` and `Curr.FSTLength` actually receive destination, byte length and byte offset. The next interrupt after a marked read copies this snapshot to `Prev`, records completion time and clears `FirstRead`, independently of whether the decoded cause reports successful completion. `HitCache` retains its literal unsigned arithmetic and OR predicate; it must not be reinterpreted as a conventional bounded cache interval.

## Interrupts, callbacks and exceptional paths

The interrupt handler cancels the timeout on entry, decodes enabled DI status into cause bits, and acknowledges status. Cause bit `1` can advance the internal sequence and return before ordinary callback delivery. Without that bit, it resets the sequence. Ordinary delivery requires a nonzero cause and consumes the active callback before invocation under a temporary OS context. Timeout handling masks interrupt bit `0x400`, consumes the active callback and reports `0x10`; it does not itself cancel queued workaround descriptors.

`DVDLowBreak` only arms flags. It does not synchronously abort a hardware transaction. `DVDLowClearCallback` disables cover reporting and detaches the active callback, but does not clear queued descriptors, cancel alarms or clear all control flags. The higher-level cancellation caller checks the detached callback's identity after removal; a mismatch does not restore it.

A recent-reset cover branch takes priority over ordinary cover waiting. The ordinary wait branch clears `WaitingCoverClose` even if no enabled cover event is found. Reset-cover notification uses a separate callback and clears that slot after invocation, unlike ordinary callback consumption. Higher-level cover recovery also has an exceptional command branch that reports `-4` rather than proceeding through reset and disc revalidation.

## Semantic review

The existing function names fit canonical behavior, including `SeekTwiceBeforeRead`; no rename is justified. Both rendered pages contain zero substitutions and no parse errors. Rendering covers function names only and leaves shadowed `Callback`/`callback` bindings unchanged, so it cannot validate parameter or data-layout hypotheses. All 53 frozen subjects, 119 facts and 33 links were enumerated. The checkpoint explicitly retains 111 facts and 26 links and records eight fact exceptions and seven link uncertainties. Four focused factual corrections are proposed below. No compiled section layout or Melee soundtrack call chain is claimed.

Status: synthesized; independent review and live promotion pending.
