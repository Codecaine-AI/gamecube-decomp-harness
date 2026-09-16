## src/MSL/stdio.h

This header defines the shared MSL stdio interface and source-level stream representations; it contains no function implementations.

- It defines seek constants, a two-element pushback capacity, unsigned-long file handles and positions, and a compiler-conditional `wchar_t` typedef. It declares I/O modes, file kinds, orientations, result codes, and stream-state values, together with mode/state fields. These declarations establish numeric constants and field widths, not runtime transition rules ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/stdio.h#L7-L65)).
- Callback typedefs describe positioning, reading/writing, closing, and idle hooks. `FILE` combines a handle, mode/state, character and wide-character pushback storage, buffer/position bookkeeping, and these callbacks. The header alone does not establish buffer ownership lifetimes, callback error handling, or compiled sizes and offsets ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/stdio.h#L67-L95)).
- String I/O control structures and read-action constants accompany the `__StringRead` declaration. `EOF` is `-1L`; buffering constants are 0, 1, and 2. Standard-stream macros address the three entries of the externally defined `__files` array. Formatting and `fwrite` declarations complete the interface; their implementations and stream initialization are outside this header ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/stdio.h#L97-L133)).

All 136 canonical and rendered lines were reviewed. The rendered view reports no parse errors or substitutions, and its unchanged function names fit the declared interfaces. Subject and link enumeration returned no records, so there is no frozen knowledge to retain or correct and no supported need for a proposal.

Status: researched; no-change lead bypass; independent review and live promotion pending.
