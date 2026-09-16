## MetroTRK event queue and lifecycle

The owned implementation and header define a two-entry FIFO of `NubEvent` records. Initialization resets occupancy and head to zero and the next event ID to `0x100`. Posting rejects exactly `fCount == 2`; otherwise it copies the input into the logical tail, assigns the queued copy an ID, increments the unsigned ID state, corrects values below 256 to 256, and increments occupancy. Retrieval copies the head into caller storage only when count is positive, decrements occupancy and wraps the head from two to zero. Empty retrieval leaves the output untouched. These capacity invariants assume initialized, uncorrupted state.

`TRKCopyEvent` copies `sizeof(NubEvent)` bytes from its second argument to its first and returns the first pointer. Canonical parameter identifiers `src` and `dst` are misleading; the existing explanations already correctly describe the actual direction established by `TRK_memcpy`.

Construction assigns the requested integer type into the byte-sized `fType`, sets event ID zero and buffer ID -1, without validating the type or releasing any previous buffer. Destruction forwards the buffer ID unconditionally and leaves the event record unchanged. `TRKReleaseBuffer` ignores -1 and other out-of-range indices; for indices 0–2 it marks the buffer unused. The nub loop destructs every dequeued event after dispatch, including shutdown and null events.

Queue operations call mutex APIs around their state accesses, but the pinned mutex implementations are no-op success stubs. Thus the API structure is nominally synchronized; these calls do not provide actual mutual exclusion or initialize the leading padding bytes. Initialization also does not drain pending events or release their buffers.

Packet intake attaches a buffer, clears its framing-state buffer reference and ignores the posting result. A full queue therefore does not automatically reclaim that buffer through this path. Disconnect and target-event producers also ignore posting failure; target input activation has an explicit branch that bypasses event creation.

Both owned canonical and rendered files were reviewed completely. Rendered function names are unchanged and fit the behavior. The header reports a `shadowed_binding` for `TRKCopyEvent`; no semantic conclusion relies on that rendered binding. Source establishes `gTRKEventQueue`, but no compiled evidence establishes the baseline's exact .bss extent or correspondence.

Status: synthesized; independent review and live promotion pending.
