## OSMessage.h

This header defines `struct OSMessageQueue` with two `OSThreadQueue` members (`queueSend` and `queueReceive`), a `void *` member `msgArray`, and three `long` members (`msgCount`, `firstIndex`, and `usedCount`). It includes `OSThread.h` and provides C linkage guards for C++ consumers. [Canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSMessage.h#L1-L17)

It declares `OSInitMessageQueue`, returning `void`, and `OSSendMessage`, `OSReceiveMessage`, and `OSJamMessage`, returning `int`. Initialization accepts a queue, message-array pointer, and count; the other APIs accept a queue, message pointer, and `long flags`. The header does not establish flag values, return-value meanings, blocking behavior, insertion order, or message-storage ownership and lifetime. [API and linkage declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSMessage.h#L19-L28)

The complete rendered view matches the canonical declarations, with no substitutions or parse errors. Existing names fit the declared interface; no supported semantic correction is warranted. The frozen subject, fact, and link inventories are empty, so no knowledge changes are proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
