## Message queue implementation

`OSInitMessageQueue` initializes separate sender and receiver thread queues, retains the caller-supplied storage pointer and capacity, and zeros the head index and occupied count. It does not allocate storage or validate capacity. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSMessage.c#L4-L11)

`OSSendMessage` appends a message at `(firstIndex + usedCount) % msgCount`. `OSJamMessage` instead moves the head backward modulo capacity and inserts there, ahead of existing messages. Both store the message value as a `u32`, increment occupancy, and wake the receiver queue. [Send](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSMessage.c#L13-L31) [Jam](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSMessage.c#L54-L70)

`OSReceiveMessage` removes the head entry, advances the head modulo capacity, decrements occupancy, and wakes the sender queue. A null output pointer suppresses the copy but still consumes the message. Removed storage is not cleared. [Receive](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSMessage.c#L33-L52)

All three operations disable interrupts and restore the prior interrupt state on success and nonblocking failure. When insertion finds `msgCount <= usedCount`, or reception finds `usedCount == 0`, flags bit 0 determines whether to return 0 immediately or sleep on the appropriate thread queue and recheck the condition. Successful operations return 1; other flag bits are not inspected here. Scheduler internals and interrupt behavior during sleep are delegated to external routines and are not established by this file. The implementation stores message values rather than copying or managing pointed-to payloads; storage and payload lifetimes remain external responsibilities. No invalid-capacity recovery is implemented. [Queue operations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSMessage.c#L13-L70)

## Semantic review

The entire canonical and rendered file was reviewed. The rendered view has no substitutions or parse errors, and the existing function names fit the canonical behavior. Subject and link enumerations are empty, with no baseline facts to retain or correct and no writable subjects. No knowledge changes are proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
