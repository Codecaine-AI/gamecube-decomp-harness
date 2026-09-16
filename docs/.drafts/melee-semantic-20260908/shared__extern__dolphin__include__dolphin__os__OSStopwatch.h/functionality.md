## OSStopwatch.h
The guarded header defines `struct OSStopwatch` with `char *name`, `long long total`, `unsigned long hits`, `long long min`, `max`, and `last`, and `int running` (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSStopwatch.h#L1-L12). It declares initialization, start, stop, check, reset, and dump entry points. Each takes a stopwatch pointer; initialization also takes a mutable character pointer, and check returns `long long` while the others return `void` (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSStopwatch.h#L14-L19).

The rendered view matches the canonical declarations, with no substitutions or parse errors. Existing names are coherent with this public interface; no supported correction is needed. There are no baseline subjects, facts, or links to disposition. This declaration-only file does not establish timing units, running-state encodings, initialization/reset values, exceptional behavior, name-pointer ownership or lifetime, or compiled structure layout.

Status: researched; no-change lead bypass; independent review and live promotion pending.
