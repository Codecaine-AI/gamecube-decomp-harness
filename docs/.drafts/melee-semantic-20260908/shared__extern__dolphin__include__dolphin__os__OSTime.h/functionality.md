## OSTime.h

This guarded header includes Dolphin types and defines time-conversion and calendar-related macros; it contains no functions or runtime state.

- `OS_TIME_SPEED` is `OS_BUS_CLOCK / 4`, matching the comment that the time-base frequency is one quarter of the bus clock. Conversion macros translate ticks to seconds, milliseconds, microseconds and nanoseconds, and back. The microsecond and nanosecond expressions preserve explicit multiplication/division ordering with factors of 8 and 8000. These are uncast arithmetic macros, not checked conversions: operand types determine arithmetic behavior, integer divisions can truncate, and intermediate multiplication is not protected against overflow. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSTime.h#L4-L19)
- Calendar-related constants define microsecond and millisecond limits of 1000, 12 months, seven weekdays and 365 year-days. Seconds-per-minute, hour, day and year use 60, 60, 24 and 365 respectively; the year expression is a fixed 365-day quantity, not leap-year handling. The header does not establish whether the `*_MAX` constants are inclusive bounds or counts in their consumers. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSTime.h#L21-L30)
- `BIAS` is defined as `0xB2575`; its purpose is not explained here. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSTime.h#L32-L34)

All 35 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors and agrees with the canonical macros. The complete subject and link enumerations are empty, so there are no baseline names, facts or links requiring retention or correction. No knowledge changes are proposed.

Status: synthesized; independent review and live promotion pending.
