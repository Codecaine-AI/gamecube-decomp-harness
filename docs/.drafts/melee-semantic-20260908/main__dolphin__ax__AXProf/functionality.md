## AX profiling buffer control

AXProf.c maintains a caller-supplied AXPROFILE array pointer, capacity, next-slot index and initialization flag. Static initialization leaves profiling unavailable. `AXInitProfile` asserts a non-null pointer and nonzero capacity, stores them, resets the index and enables acquisition; it neither allocates nor clears the records.

`__AXGetCurrentProfile` returns null without changing the index when disabled. Otherwise it obtains the current element's address, increments the unsigned index and reduces it modulo capacity before returning. It does not populate the record. Canonical AXOut.c independently confirms that `__AXOutNewFrame` copies 56 bytes from its local frame profile into a non-null acquired slot. The stored buffer must remain valid while used; repeated acquisition wraps and reuses slots.

`AXGetProfile` disables interrupts, snapshots the index, decrements the snapshot only if nonzero, resets the shared index to zero, restores the previous interrupt state and returns the snapshot. It does not disable profiling or clear records. Its result is not an unambiguous record count: a wrapped index and an untouched index both yield zero, as does an index of one. Unlike this query/reset operation, initialization and acquisition contain no local interrupt masking.

The rendered view covers all 47 lines, reports no parse errors and makes no substitutions. Existing function naming is adequate. The source's `.sbss` comment does not prove compiled section size, placement or ordering.

Status: synthesized; independent review and live promotion pending.
