## Runtime memory primitives

`memset` forwards its destination, fill value and byte count unchanged to the private `__fill_mem` helper, then returns the original destination. The helper narrows the fill value to an unsigned byte. Counts below 32 use byte stores; larger counts first peel bytes to align the destination, then perform eight-word blocks, residual words and a zero-to-three-byte tail. A zero fill skips repeated-byte expansion, and zero derived counts skip their corresponding store loops. These word-size descriptions apply to the intended 32-bit target, not arbitrary host ABIs. The compiler-specific `INCREMENT_ASSIGN` definitions implement pointer advancement followed by a store. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/__mem.c#L5-L80)

`memcpy` compares source and destination after conversion to `unsigned long`. It copies forward when the source address is at or above the destination and backward otherwise, preserving unread overlapping source bytes in this implementation. Both branches return the original destination and perform no memory transfers for a zero count. This behavior is not a portable standard-library guarantee permitting overlapping `memcpy` calls. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/__mem.c#L84-L106)

The routines manipulate caller-owned buffers synchronously; the unit defines no persistent data or retained pointer lifetime. All three routines carry `SECTION_INIT` annotations, but source alone does not establish compiled section size, offsets or adjacency to another unit.

Existing function names and behavioral explanations fit the canonical implementation. The rendered view contains no substitutions and agrees with the source text, but reports 13 parse errors and marks definitions of `__fill_mem` and `memcpy` parse-uncertain. No rename or equivalent explanatory rewrite is warranted. Fifteen baseline facts are explicitly retained; two compiled-layout-dependent facts remain unresolved.

Status: synthesized; independent review and live promotion pending.
