## DVD error encoding and recording

`dvderror.c` provides one exported recording function and two static conversion helpers. `ErrorTable` is a source-declared `u32[16]` array. `ErrorCode2Num` searches it in order, returning the matching zero-based index or 29 when no entry matches.

`Convert` handles full-word sentinel inputs before ordinary decoding: `0x01234567` becomes 255 and `0x01234568` becomes 254. Otherwise it extracts the high-byte status, clamps values of 6 or greater to 6, looks up the low 24 bits, and returns `status * 30 + ordinal`. Ordinary outputs therefore cannot exceed 209. The code does not assign descriptive meanings to every numeric status or table entry. [Conversion source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dvd/dvderror.c#L6-L47)

`__DVDStoreErrorCode(u32 error)` converts its argument before acquiring the extended SRAM lock, assigns the resulting byte to `dvdErrorCode`, and calls `__OSUnlockSramEx(TRUE)`. It neither performs DVD recovery nor reports persistence success. [Recording source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dvd/dvderror.c#L49-L59)

DVD callers record errors on fatal-error and retry paths; the timeout path supplies `0x01234568`. Recovery proceeds in the caller after recording. [Caller evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dvd/dvd.c#L146-L308)

The SRAM pointer refers to OS-managed cached storage. The OS lock protects it using interrupt state; committing unlock attempts hardware write-back and releases the lock. Lock acquisition can return NULL when already locked, and write-back can fail. This DVD routine does not check either outcome, so recording intent must not be equated with guaranteed hardware persistence. [OS lifetime and commit evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSRtc.c#L124-L225)

## Semantic review

All 13 baseline facts and both links are explicitly retained in checkpoint groups. Their names and behavioral descriptions remain useful; no equivalent-wording rewrites are proposed. The rendered file has no substitutions or parse errors and agrees with canonical behavior. Its rendering covers function names only, so it does not independently validate data or parameter names. Existing source-level `ErrorTable` knowledge is supported, but compiled section identity and extent are not independently established.

Status: synthesized; independent review and live promotion pending.
