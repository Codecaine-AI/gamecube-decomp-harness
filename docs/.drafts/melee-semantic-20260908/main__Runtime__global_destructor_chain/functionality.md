## Global destructor chain

The unit defines a singly linked `DestructorChain` with `next`, a `void (*)(void*, int)` callback, and an object pointer, together with the global head. `__destroy_global_chain(void)` removes each head before calling its destructor with the stored object and literal `-1`. An empty chain is a no-op. The loop rereads the mutable head after each callback, so callback-added nodes remain eligible for the same drain. Termination requires the head eventually to become null and callbacks to return; this code contains no allocation, explicit node deallocation, or exception recovery. The meaning of `-1` beyond its callback argument role is not established here. [Implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/global_destructor_chain.c#L5-L20)

Normal `exit` invokes the drain after ordinary atexit callbacks and before traversing the null-terminated `_dtors` callback table. Those stages are skipped when `__aborting != 0`; later cleanup remains outside that branch. Registration and node-storage ownership are not implemented in this unit. [Exit integration](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/abort_exit.c#L24-L47)

The source also declares a `SECTION_DTORS` constant reference initialized to `__destroy_global_chain`, not an explicit null terminator. This declaration alone cannot identify the compiled section target, its extent, or its position in the linked table. [Reference](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/global_destructor_chain.c#L22-L23)

The header exposes the parameterless void drain. Both rendered files match canonical names, with zero substitutions or parse errors. Existing behavioral explanations and the canonical function name fit; no equivalent-wording rewrites are proposed. Section-specific baseline claims remain qualified pending compiled evidence.

Status: synthesized; independent review and live promotion pending.
