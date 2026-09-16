## MCC/FIO shared interface

`extern/dolphin/include/dolphin/mcc.h` declares MCC channel communication and FIO file-operation interfaces; it contains no function implementations.

- Defines system channel 0 and numbered channels 1–15, EXI selections 0–2, system-event values, and channel/device/system callback signatures. Two event callback arguments remain unnamed. [Canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mcc.h#L4-L47)
- Declares communication headers and channel metadata, including connection/lock fields, event callback and mask, stream flags, and an unidentified `unk` member. Connection states are explicitly 0–3; synchronous/asynchronous selectors are 0/1. FIO asynchronous states preserve the original `FIO_ASYNC_STATE_IDOL = 0`, `BUSY = 1`, and `DONE = 2` spelling and values; these declarations alone do not establish runtime transitions. [Canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mcc.h#L49-L91)
- Declares date/time, file-statistics, and directory-search records, including high/low file-size fields and a 256-character filename array. Offset comments are source annotations, not independently verified compiled layout. [Canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mcc.h#L93-L123)
- The `fio.c` declaration group covers initialization, shutdown, queries/errors, handle-based file operations, directory searches, and asynchronous reads/writes with completion-result output. The `mcc.c` group covers streams, initialization, device enumeration, channel status, notifications, event masks, opening/closing/locking, and synchronous/asynchronous transfers. Buffer ownership, callback lifetime, error conventions, and exceptional branches cannot be determined from these signatures. [Canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mcc.h#L125-L167)

## Semantic review

All 170 canonical and rendered lines were reviewed. The rendered view has zero substitutions and zero parse errors; existing names remain unchanged. Subject and link enumeration returned no records, consistent with zero baseline facts, links, and writable subjects. There is no supported correction requiring a proposal.

## Lead reconciliation

Inherited full source and enumeration coverage from the hash-bound research handoff. Independently reconciled the functionality artifact with the empty proposal: neither proposes renames, runtime behavior, or compiled-layout conclusions beyond the documented evidence. There are no upstream non-retain dispositions or contradictions to reconcile and no proposed facts requiring targeted citation checks. Existing names and the research explanation are retained. Deferral of error conventions, unnamed callback arguments, asynchronous lifetimes, exceptional branches, the unidentified member, and compiled layout is accepted because declarations alone do not resolve them.

Status: synthesized; independent review and live promotion pending.
