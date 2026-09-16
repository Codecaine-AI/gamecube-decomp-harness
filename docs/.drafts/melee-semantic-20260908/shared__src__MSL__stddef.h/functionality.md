## src/MSL/stddef.h
This guarded compatibility header defines `wchar_t` as `unsigned short`, `size_t` as `unsigned long`, `intptr_t` as `signed int`, and `uintptr_t` as `unsigned int`. Its `offsetof(type, member)` macro casts the address of a member selected through a null `type*` to `size_t`; `NULL` is defined as `0L` only when not already defined. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/stddef.h#L1-L17.

All 18 canonical and rendered lines were reviewed. The rendered view makes no substitutions and agrees with canonical text, despite reporting six parse errors. There are no baseline subjects, facts, or links and no supported semantic correction to propose. These source declarations alone do not establish compiled widths, pointer representability, or layout.

Status: synthesized; independent review and live promotion pending.
