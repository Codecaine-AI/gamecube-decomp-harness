## ANSI file initialization

`src/MSL/ansi_files.c` defines the initialized, non-const global `FILE __files[3]`. The three entries reference `stdin`, `stdout`, and `stderr` respectively: each contains two pointers to that stream's `char_buffer`, with a literal `1` between them. All three entries install `__read_console`, `__write_console`, and `__close_console` and otherwise contain numeric or null initializers. The first entry differs from the other two in an early initializer (`1` versus `2`). Without inspecting the FILE declaration, those positional numeric values are not assigned mode or state meanings.

This translation unit contains storage initialization, not executable stream-processing branches. The console callbacks are external dependencies; their behavior and subsequent stream mutations or closing lifetimes are not established here. No compiled section size, placement, or layout is inferred from the source.

The rendered file matches the canonical file, with no substitutions or parse errors. The existing conservative data-ownership fact is retained. A source-level purpose fact is proposed to record the useful initialization behavior absent from the baseline.

Status: synthesized; independent review and live promotion pending.
