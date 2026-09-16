## OSReboot.h

This 20-line header supplies declarations, not reboot implementation. It includes Dolphin types, uses an include guard, and wraps its declarations in `extern "C"` for C++ consumers ([lines 1–8](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSReboot.h#L1-L8), [lines 15–19](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSReboot.h#L15-L19)).

`RunCallback` is a pointer to a function taking no arguments and returning `void`. `Run` accepts that callback type and returns `void`. `__OSReboot` returns `void` and accepts two `u32` parameters named `resetCode` and `bootDol` ([lines 10–13](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSReboot.h#L10-L13)). These declarations do not establish whether either function returns in practice, when or how a callback executes, parameter value meanings, exceptional branches, or cross-file resource lifetimes.

All canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors; both function names remain unchanged and are marked as shadowed bindings. It supplies no independent behavioral evidence. The frozen baseline contains no subjects, facts, or links for this assignment. No supported semantic correction or rename is warranted, and no knowledge mutation is proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
