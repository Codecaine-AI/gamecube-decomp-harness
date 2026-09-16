## MetroTRK user-output initialization

`usr_put.c` defines only `void usr_put_initialize(void)`, with an empty body. It accepts no arguments, returns no status, calls no functions, and performs no application-state reads or writes. `OSReport` is declared but never called in this unit. The header declares the initializer and `usr_puts_serial(const char* msg)`; it does not establish the latter's implementation or behavior.

`TRKInitializeNub` invokes the initializer only when the result of endian initialization equals `kNoError`. The void call leaves that result unchanged; event-queue initialization follows under another `kNoError` guard. Thus the existing description of an inert user-output startup hook is supported. There are no internal exceptional branches, numeric states, resources, or cross-file lifetimes introduced by this implementation.

Canonical evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/usr_put.c#L1-L5; code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/usr_put.h#L1-L7; code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/nubinit.c#L13-L35.

Both rendered files preserve canonical function names, with no substitutions or parse errors. Existing names and all five explanations remain useful and supported; no semantic changes are warranted. No compiled layout or section conclusions are drawn.

Status: researched; no-change lead bypass; independent review and live promotion pending.
