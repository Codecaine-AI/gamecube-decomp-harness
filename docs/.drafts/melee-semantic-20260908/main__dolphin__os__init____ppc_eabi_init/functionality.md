## PowerPC EABI bootstrap and termination

The canonical and rendered file were reviewed completely. Existing function names fit their behavior; no rename is warranted.

- `__init_hardware` enables MSR_FP without clearing other MSR bits, saves the return address in r31, calls `__OSPSInit` then `__OSCacheInit`, and returns. The callees configure HID2/GQR0 and conditionally enable cache levels; cache initialization also installs its machine-check handler unconditionally.
- `__flush_cache` computes `first = address & 0xFFFFFFF1`, adds `address - first` to the count, and executes `dcbst`, `sync`, and `icbi` at eight-byte increments. The mask preserves bit zero: this is not conventional alignment-down. The first iteration is unconditional; subsequent iterations depend on the signed result of the eight-byte decrement being nonnegative. Zero size is not independently rejected, and an exact nonnegative multiple of eight visits the endpoint before terminating. Arithmetic is register-width arithmetic, not an unrestricted mathematical range guarantee. A final `isync` precedes return.
- The startup caller invokes hardware initialization before section initialization. Copy and flush occur only when size is nonzero and source differs from destination. `__init_user` runs after OS initialization and the optional reset check, before `main`.
- `__init_user` calls `__init_cpp`, which walks `_ctors` forward until its first null entry. `__fini_cpp` similarly walks `_dtors` forward, not backward. Neither walker records completion; repeated invocation repeats dispatch, assuming callbacks return and do not change subsequent traversal behavior. Callback storage and registration are external to this file.
- The local weak `exit` ignores status, dispatches destructors, then calls `_ExitProcess`; the weak `abort` bypasses destructor dispatch. The separate MSL exit implementation has additional conditional cleanup and converges on the same wrapper. `_ExitProcess` itself only calls `PPCHalt`, whose canonical implementation synchronizes and spins indefinitely.

Source annotations establish intended `.init`, `.ctors`, and `.dtors` grouping, not compiled contiguity or final linked layout. The rendered view has no substitutions, reports 37 parse errors, marks both assembly routines parse-uncertain, lacks identities for `__fini_cpp` and `abort`, and binds `exit` to the MSL file. These limitations do not invalidate the canonical definitions or prove which weak definition is selected by the linker.

Status: synthesized; independent review and live promotion pending.
