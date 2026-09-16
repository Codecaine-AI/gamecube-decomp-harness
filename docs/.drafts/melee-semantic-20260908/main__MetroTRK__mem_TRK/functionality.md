## MetroTRK memory primitives

`TRK_memcpy` copies `n` bytes in increasing address order and returns the original destination. Its unsigned increment/pre-decrement counter produces no transfers for zero length. There is no overlap-direction selection, bounds checking, allocation, or cache maintenance.

`TRK_memset` forwards its arguments unchanged to `TRK_fill_mem`, then returns the original destination. The worker converts the value to `u8`. Counts below 32 use byte stores only. For larger counts it peels up to three bytes to reach four-byte alignment, constructs a repeated-byte word (skipping expansion for zero), writes eight words per complete 32-byte block, then residual words and zero to three trailing bytes. Alignment can reduce an initially 32-byte request enough to skip the bulk-block loop. Zero count performs no stores; the source still forms its pre-adjusted pointer, so this is not a general claim of portable null-pointer validity.

Message-buffer callers bound their transfers and update positions afterward. Event callers copy fixed-size records synchronously; the memory primitive does not acquire ownership of referenced message buffers. Exception-vector installation copies to a translated address and subsequently flushes that range in the caller.

Canonical and rendered files agree on all three function names; existing names and supported behavioral explanations need no changes. The header annotates `TRK_memcpy` and `TRK_memset` with `SECTION_INIT`, but source declaration order and annotations do not establish compiled contribution extent, adjacency, or address. No compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
