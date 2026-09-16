## DSP diagnostic and current-task helpers

`__DSP_debug_printf(const char* fmt, ...)` is an unconditional empty implementation. It consumes none of its arguments and performs no formatting, output, state mutation, or error handling. `DSPInit` supplies a build-date/time format string before checking its initialization flag, confirming the diagnostic role without implying that this implementation emits anything. Existing function knowledge and the unchanged rendered name fit canonical behavior.

The unit also defines `__DSPGetCurrentTask`, which returns the externally maintained `__DSP_curr_task` pointer directly. It neither dereferences nor validates the pointer, changes ownership, nor adds synchronization. `DSPInit` sets that pointer to NULL during initialization; the accessor does not guarantee a non-null result or extend the pointed-to task's lifetime. The baseline unit-purpose rationale incorrectly treated the diagnostic stub as the sole definition, so the proposed correction includes the accessor.

Both canonical and rendered source were reviewed through all 13 lines. The rendered view has no substitutions or parse errors. No compiled layout or section conclusions are made.

Status: synthesized; independent review and live promotion pending.
