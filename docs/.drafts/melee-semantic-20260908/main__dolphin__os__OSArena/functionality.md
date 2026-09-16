## OSArena semantic review

The complete 60-line canonical source and rendered view were reviewed, along with all 15 subjects, 39 facts and two links. The renderer reports no parse errors and no substitutions; the six existing function names accurately describe their behavior. Parameter subjects have no baseline facts, and no register-to-parameter mapping is inferred from source alone.

### State and operations

The unit maintains two static `void*` boundaries. `__OSArenaLo` starts at `(void*)-1`; `__OSArenaHi` has implicit static zero initialization. Both getters contain source assertions requiring `(u32)__OSArenaLo != -1` and `(u32)__OSArenaLo <= (u32)__OSArenaHi`, then return their boundary unchanged. These predicates do not independently prove that OSInit ran: direct setters can replace either bound without checking initialization, alignment or ordering. No claim is made that the assertions survive compilation. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSArena.c#L4-L33)

Low allocation returns `ROUND(oldLo, align)` and installs `ROUND(start + size, align)` as the new low boundary. High allocation truncates the old high boundary, subtracts the byte count, truncates again, and both stores and returns that result. Neither allocator checks the newly computed boundary against the opposite end, provides a failure status, or rolls back. Padding can consume space even for size zero. The alignment macros use 32-bit masks, so normal inward movement assumes suitable nonzero power-of-two alignment and non-wrapping arithmetic; arbitrary inputs do not have a guaranteed monotonic result. [Allocators](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSArena.c#L35-L59) · [Macros](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os.h#L47-L50)

### Cross-file lifecycle

OSInit installs boot-provided or linker-derived bounds. The aligned stack-end alternative for the low bound requires a missing boot low bound, an available debug flag, and a flag value below 2. Startup reports the bounds and clears arena ranges, with reset/boot-region branches that can preserve memory rather than clearing the entire interval. [OS initialization](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OS.c#L116-L241)

The FST loader later installs `bb2->FSTAddress` as the high bound after waiting for drive status zero; its saved old high-bound local is not restored. Melee startup reserves `0x01800000` bytes with alignment 4 when integer division of simulated memory size by one MiB equals 48, then measures the remaining arena. Crash-handler setup reserves `0x2000` bytes from the low end only when no debugger is present. [FST](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dvd/fstload.c#L45-L98) · [Startup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L143-L153) · [Crash workspace](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L62-L80)

HSD framebuffer allocation falls back to heap allocation when rounded bounds are equal; FIFO allocation uses its heap branch when both rounded bounds are zero. Arena branches update the low frontier after their own capacity checks. HSD_OSInit advances past allocator metadata, creates audio and general heaps, saves the next-arena bounds, and moves OS arena low to the general heap end. Later main-heap recreation uses the separately saved bounds, preserving their lifetime beyond the OS arena reservation. [HSD consumers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L87-L235)

### Disposition

Retain 26 supported facts and both pattern links. Correct three state-behavior explanations: two overstate unconditional monotonic allocation, and one ambiguously reverses getter success conditions. Leave ten data-section facts unresolved only as to their compiled-target attribution: the source-object behavior is supported, but no supplied compiled evidence proves `.sbss`/`.sdata` object mapping or layout.

Status: synthesized; independent review and live promotion pending.
