## DVD public interface

`extern/dolphin/include/dolphin/dvd.h` defines the shared DVD interface rather than executable implementations. Its data declarations cover disk identification, linked command blocks with transfer bookkeeping and callbacks, file information embedding a command block, directory iteration records, boot/FST information, and drive information. The offset comments are source annotations, not independently verified compiled-layout evidence. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dvd.h#L6-L75)

The declarations expose low-level drive operations; command-block reads, seeks, streaming, disk changes, inquiry, cancellation and status operations; and filesystem path, file, directory and stream interfaces. Command-block and file callbacks have distinct context-pointer types. These signatures alone do not establish callback timing, buffer ownership, cancellation completion guarantees, or cross-file object lifetimes. Repeated declarations near the end do not establish additional implementations. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dvd.h#L77-L151) [Repeated declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dvd.h#L202-L210)

`DVDReadAsync` forwards to `DVDReadAsyncPrio` with priority 2. Result codes and command states are separate numeric domains: ignored is result -2 versus state 9, and canceled is result -6 versus state 10. The header defines minimum transfer size 32 without itself establishing enforcement or alignment rules. Interrupt constants are TC=1, DE=2 and CVR=4; the comments explicitly leave bitfield interpretation and type 3 uncertain. Command identifiers run from NONE=0 through BS_CHANGE_DISK=15; no state transitions or exceptional execution branches are implemented here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dvd.h#L153-L200)

## Semantic assessment

All 213 canonical and rendered lines were reviewed. The rendered source has no name substitutions or parse errors. Existing public names fit the declarations; there is no supported reason to rename them from this header alone. Renderer shadowed-binding annotations are not treated as canonical identity evidence. Subject and link enumeration both completed with zero records, leaving no baseline facts or links to retain or correct and no warranted proposal.

Status: synthesized; independent review and live promotion pending.
