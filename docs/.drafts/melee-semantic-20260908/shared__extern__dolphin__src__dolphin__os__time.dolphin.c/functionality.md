## Time hooks

- `__get_clock` always returns signed `long long` -1; it does not read a clock.
- `__get_time` evaluates `OSTicksToSeconds(OSGetTime())`, casts the result to `u32`, then subtracts `0x43E83E00`, returning `unsigned long`. The cast precedes subtraction. This file alone does not establish the offset’s epoch meaning or the external clock/conversion semantics.
- `__to_gm_time` always returns integer 0 and performs no conversion.

These bodies contain no local persistent state, resource lifetimes, or explicit conditional branches. Evidence: [canonical implementations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/time.dolphin.c#L6-L16).

The complete rendered view matches canonical source, with zero substitutions and zero parse errors. All subject and link pages were enumerated; both inventories are empty. There is no existing semantic knowledge requiring correction, and no proposal is warranted.

Status: researched; no-change lead bypass; independent review and live promotion pending.
