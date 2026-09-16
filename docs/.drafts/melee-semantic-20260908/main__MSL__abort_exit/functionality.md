## MSL termination

`exit(int code)` accepts but does not read `code`. When `__aborting == 0`, it drains `atexit_funcs` by pre-decrementing its positive counter, calls `__destroy_global_chain`, walks `_dtors` forward until a null entry, and invokes then clears the optional `__stdio_exit` hook. Any nonzero abort value skips this entire group.

Both paths then drain `__atexit_funcs` by the same reverse-index mechanism, call `__kill_critical_regions`, invoke then clear the optional `__console_exit` hook, and call `_ExitProcess()` without forwarding status. Its included external declaration marks `_ExitProcess` nonreturning. `__fini_cpp_exceptions` is declared here but not called directly.

The unit declares two static 64-entry arrays of parameterless callbacks, three static integers, and two static callback hooks. Static initialization supplies zero values. Counter loops test strictly greater than zero: negative values also skip dispatch, and this function supplies no upper-bound validation. Registration and hook installation are not shown. Hooks are cleared after invocation returns, so the code does not establish reentrant one-shot protection. Later cleanup stages likewise depend on earlier callbacks returning.

The header declares `void exit(int code)`. Both complete rendered files match canonical function names, with no substitutions or parse errors. Existing names fit the behavior; no rename or equivalent explanatory rewrite is warranted. Source supports the shutdown semantics but does not independently establish compiled section extents or object placement.

Status: synthesized; independent review and live promotion pending.
