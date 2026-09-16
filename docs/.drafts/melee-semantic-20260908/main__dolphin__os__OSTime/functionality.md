## OSTime semantic review

The canonical and rendered file were read completely. Existing function names fit their implementations; no semantic rename is warranted. The rendered view made no substitutions and reported 22 parse errors, including uncertainty around assembly routines; canonical source, rather than rendered naming, supports this assessment.

### Hardware and adjusted time
- `OSGetTime` obtains a coherent 64-bit time-base snapshot by reading TBU/TBL/TBU and retrying when the upper samples differ. `OSGetTick` returns only the low half, with its corresponding wraparound limitation.
- `__SetTime` clears TBL before writing TBU and then the requested TBL. `__OSSetTick` changes only TBL.
- `__OSSetTime` disables interrupts, updates the shared adjustment at `0x800030D8` by old raw time minus requested raw time, replaces the hardware counter, calls `EXIProbeReset`, and restores the saved interrupt state. The adjustment compensates for the raw-clock change; the EXI call's broader lifetime effects are not inferred here.
- `__OSGetSystemTime` samples raw time and adds that adjustment. `__OSTimeToSystemTime` instead adds the current adjustment to a caller-supplied timestamp, without taking a new clock sample. Both restore the prior interrupt state, including an already-disabled state.

### Calendar conversion
The two integer tables hold cumulative month-start offsets, despite comments describing month ends. Gregorian leap-year helpers select the appropriate table. `GetDates` asserts a nonnegative absolute day count, corrects its initial year estimate backward, and searches backward for the containing month. It writes weekday, year, zero-based year-day and month, and one-based month-day.

`OSTicksToCalendarTime` normalizes a negative fractional-second remainder before deriving microseconds and milliseconds. After removing that fraction, it applies the day bias and borrows a day if the seconds-of-day remainder is negative. Assertions constrain intermediate values; these should not be interpreted as unconditional release-build input validation. The helper supplies date fields and the caller supplies time-of-day fields.

`OSCalendarTimeToTicks` normalizes overflowing or negative months into a year adjustment, asserts year-range constraints, accumulates Gregorian days and time-of-day seconds, subtracts the literal epoch offset, and adds both millisecond and microsecond contributions. No unverified numerical expansion of conversion macros or compiled layout is claimed.

### Consumers and disposition
MCC uses low-half samples for timeout calculations, including its own high-bit correction branch. Melee's memory-card label consumer converts current OS time through whole seconds and formats the resulting date with a one-based displayed month. Existing substantive behavioral explanations remain supported. Two facts asserting compiled `.data` placement remain unresolved because source declarations alone cannot establish section membership. No knowledge writes are proposed.

Status: synthesized; independent review and live promotion pending.
