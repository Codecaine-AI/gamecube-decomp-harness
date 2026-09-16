## src/MSL/console_io.h

This guarded header includes `<Runtime/platform.h>` and declares four functions: `s32 MSL_ConsoleIo_80325F18(void)`, `__write_console`, `__read_console`, and `__close_console`. The read/write declarations return `int` and accept an unnamed `u32`, `u8* buf`, `u32* n`, and a `void (*f)(void)` parameter; close returns `int` and accepts an unnamed `u32`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/console_io.h#L1-L11.

The header provides no implementations, so it does not establish return-code meanings, callback invocation, buffer ownership, count direction, or the purpose of `MSL_ConsoleIo_80325F18`. The rendered view preserves all canonical names, with no substitutions or parse errors. No name correction is supported by this declaration-only evidence. The frozen subject, fact, and link inventories are empty; no proposal is warranted.

Status: researched; no-change lead bypass; independent review and live promotion pending.
