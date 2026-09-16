## Exception-fragment registry

This translation unit provides a private, persistent one-entry registry, `fragment_info[1]`. Each `ProcessInfo` contains an exception-information pointer, a `char*` TOC context, and an integer occupancy flag. The header defines `__eti_init_info` with exception-table start/end pointers, a code-start pointer, and a code-size field, and declares both registry operations.

`__register_fragment` accepts the two context pointers. If `active == 0`, it stores them without validating or dereferencing them, sets `active` to 1, and returns handle **0**. Otherwise it leaves the entry unchanged and returns **-1**. Availability depends on the integer flag, not pointer nullness; even null input pointers can occupy the slot. The tested unavailable condition is any nonzero flag, although this unit only writes 0 and 1.

`__unregister_fragment` accepts only handle **0**. It clears both pointers and the flag without checking prior occupancy, making repeated valid-handle calls idempotent. Negative handles and handles at least 1 cause no writes. Registration can subsequently reuse the cleared slot. Clearing pointers does not free their referents; this file neither establishes caller-side lifetimes nor supplies allocation, copying, synchronization, or downstream exception-table traversal.

Evidence: [registry declarations and complete operations](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/Gecko_ExceptionPPC.c#L3-L41); [metadata type and public declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/Gecko_ExceptionPPC.h#L4-L12).

## Semantic assessment

The existing function names and local behavioral explanations fit canonical behavior. Both rendered files preserve the canonical function names, with zero substitutions and zero parse errors. Their renderer covers function names only, so it provides no independent validation of data or parameter naming. `fragment_info` is supported as the authored object name, while its association with the aggregate `.bss` target remains an inference. Source declarations do not establish compiled section placement, offsets, padding, or section extent. Existing useful semantic knowledge is retained; no supported rename or corrective write is necessary.

Status: synthesized; independent review and live promotion pending.
