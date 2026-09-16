## GPIO-backed VI I2C interface

The file maintains persistent byte-sized output-data and output-enable shadows and implements VI clock/data access through EXI. Initialization clears both shadows, writes data before output enable, sets video-reset bit 2 low, busy-waits for at least 100 microseconds in OS ticks, sets that bit high, then enables I2C by driving bit 4 low. Reset and enable helpers force their respective output-enable bits on. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/gpioexi.c#L7-L37 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/gpioexi.c#L81-L103.

SCL uses bit 1 and SDA bit 0. Their setters change only output enable: zero enables output and any nonzero value disables it. With the corresponding output-data bits kept zero, this implements drive-low/release behavior rather than actively writing a high value. Getters read GPIO input and normalize the selected bit to 0 or 1. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/gpioexi.c#L31-L79.

Output data and output enable use addresses 0x800404 and 0x800408. The write helper constructs `(addr | 0x02000000) << 6`, locks and selects EXI channel 0/device 1 with selection parameter 4, sends the four-byte command followed by one byte placed in the high byte of a word, synchronizes after each transfer, then deselects and unlocks. Input sends command 0x20010100 and receives one byte before extracting the high byte. No additional hardware or compiled-layout interpretation is needed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/gpioexi.c#L105-L157.

Failure handling is limited: lock failure returns 0 immediately; selection failure unlocks and returns 0. Transfer, synchronization and deselection results are ignored, so a returned 1 does not establish that all operations succeeded. Higher-level functions ignore helper results. Consequently, output shadows can diverge from hardware after failure, and either getter can inspect an uninitialized local byte when input exits before assigning it. EXI locking encloses individual transactions, not complete shadow updates or the initialization sequence. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/gpioexi.c#L18-L103 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/gpioexi.c#L115-L157.

## Semantic review

All 158 canonical and rendered lines were reviewed. Rendering reported no parse errors and no substitutions; existing function names fit their canonical roles. The complete subject and link enumerations are empty, leaving no baseline facts or links to retain or correct and no writable subjects. No knowledge changes are proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
