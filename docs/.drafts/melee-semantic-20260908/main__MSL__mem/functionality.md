## MSL memory operations

`src/MSL/mem.c` implements three libc entry points. Existing names and all ten baseline facts remain supported; no semantic changes are proposed.

- **`memmove`** returns the original destination pointer. Direction is selected by comparing source and destination addresses cast to `u32`, not by testing whether ranges overlap. For lengths below 32 bytes, it copies forwards when source is at or above destination and backwards otherwise; zero length performs no byte transfer. For lengths of at least 32 bytes, it selects one of four external long-copy helpers using direction and whether the pointers have equal low two address bits. Equal relative alignment does not require both pointers to be individually four-byte aligned. The entry-point strategy is supported here; external helper internals and performance are not independently established. [Canonical implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/mem.c#L6-L50)
- **`memchr`** converts the search value to `u8`, scans forwards through the requested byte range, and returns the first matching byte's pointer or `NULL`. A zero count causes no load. [Canonical implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/mem.c#L52-L65)
- **`memcmp`** compares unsigned bytes in parallel and returns exactly -1 or 1 at the first mismatch, according to byte ordering. It returns zero when the requested range compares equal, including zero length without buffer loads. [Canonical implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/mem.c#L67-L84)

All canonical and rendered lines were reviewed through restored evidence, together with every frozen subject and link page. The rendered view contains no substitutions or parse errors; its unchanged names fit canonical behavior. No compiled layout claims are made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
