## OSTimer.c semantic review

All 142 canonical and rendered lines were reviewed, and subject/link enumeration completed. The frozen baseline contains no subjects, facts, or links. No knowledge changes are proposed. Existing source names fit their behavior, with important qualifications below. Rendered names introduce no substitutions and supply no independent semantic evidence; the renderer reports 34 parse errors.

### State and initialization
A single static timer record stores a callback, saved countdown, initial countdown, numeric mode, stopped flag, and initialized flag. `OSInitTimer` marks the timer stopped and replaces both countdown values and the mode. Only its first initialization installs `DecrementerExceptionHandler` at exception index 8 and clears the callback; later initialization preserves the callback and does not reinstall the handler. The time-limit panic is DEBUG-only. The source's `.bss` comment is not compiled placement evidence. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSTimer.c#L6-L57)

### Callback replacement and start/stop
`OSSetTimerCallback` returns the previous callback and marks the timer stopped before replacing it. It neither snapshots nor rewrites the hardware decrementer. `OSStartTimer` disables interrupts, writes the saved countdown to the decrementer, clears the stopped flag, and restores the previous interrupt state. `OSStopTimer` similarly protects its update: only if running does it mark stopped and snapshot the decrementer, clamping values with bit 31 set to zero. It does not halt the hardware decrementer. Initialization checks in these APIs are DEBUG-only. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSTimer.c#L23-L91)

### Exception processing
The C exception callback clears and selects a temporary context. If the timer is running, numeric mode 1 reloads the initial countdown before callback invocation; mode 2 marks the timer stopped before invocation. Other values do neither, but still permit a non-null callback to run. A stopped timer skips all three actions. Afterwards the temporary context is cleared, the interrupted context is selected, and `OSLoadContext` is called. The mode branches do not update the saved countdown, so a later start uses the value last initialized or captured by stop, not necessarily the current hardware value. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSTimer.c#L38-L111)

The assembly entry saves GPRs 0–2 and 6–31, plus GQRs 1–7, into the supplied context and branches to the C callback. This is not evidence that this entry alone saves a complete processor context; preceding exception machinery and handler ownership across other files remain outside the established behavior. No teardown or previous-handler restoration appears in this file. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSTimer.c#L114-L141)

Status: synthesized; independent review and live promotion pending.
