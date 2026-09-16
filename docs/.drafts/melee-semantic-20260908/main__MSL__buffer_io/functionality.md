## Buffered stdio helpers

`__prep_buffer` resets `buffer_ptr` to `buffer`, computes `buffer_len = buffer_size - (position & buffer_alignment)`, and snapshots the current position in `buffer_pos`. It neither rounds the stream position down nor allocates storage. The mask expression is explicit; permissible alignment values and capacity invariants are not established here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/buffer_io.c#L3-L9)

`__flush_buffer` computes the pending extent from `buffer_ptr - buffer`. For a nonempty extent it passes the handle, buffer, mutable length and idle callback to `write_proc`. It copies the callback-reported length into a non-null `bytes_flushed` before testing status. A nonzero status is returned unchanged, without this helper advancing position or preparing the buffer again; callback mutations are not rolled back. A zero status advances position by the reported count and prepares the buffer. There is no local retry or check that the reported count equals the requested count. An empty flush skips the callback, leaves `bytes_flushed` untouched, prepares the buffer and returns zero. The binary-mode conditional performs no newline conversion in this implementation. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/buffer_io.c#L11-L35)

The header declares these helpers, newline conversion helpers and `__load_buffer`, and defines `__align_buffer` and `__dont_align_buffer` with implicit values 0 and 1. It does not establish the implementations or lifetimes of those external helpers. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/buffer_io.h#L1-L18)

Both rendered files match the canonical function names with no substitutions or parse errors. Existing names and all twelve baseline facts remain supported; segment terminology is interpreted as buffer bookkeeping, not a rounded position or compiled-layout claim. No semantic rewrite is warranted.

Status: researched; no-change lead bypass; independent review and live promotion pending.
