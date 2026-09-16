### Philips initialization
`__VIInitPhilips` initializes I2C and unconditionally passes the NTSC tables to `send7120Data`; PAL tables are declared but not selected here (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/initphilips.c#L5-L30; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/initphilips.c#L63-L67).

The helper issues 97 two-byte calls to `__VISendI2CData` with address argument `0x88`. Each buffer contains an index and value: indices 0–37 receive zero, 38–41 receive the four range0 bytes, 42–57 receive zero, index `0x3A` receives decimal 19, and 90–127 receive the 38 range1 bytes. Indices 59–89 are not written. Call results are not inspected; this function has no retry or failure branch (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/vi/initphilips.c#L31-L61). The two-byte buffer is automatic storage reused across calls; whether the external I2C implementation retains its pointer is not established here. No register-bit semantics, address-convention interpretation, or compiled placement is inferred.

Canonical and rendered views were read completely. The rendered view has zero substitutions and zero parse errors, and existing source names fit the observed initialization and table-sending behavior. There are no baseline subjects, facts, or links to retain or correct; no proposal is warranted.

Status: researched; no-change lead bypass; independent review and live promotion pending.
