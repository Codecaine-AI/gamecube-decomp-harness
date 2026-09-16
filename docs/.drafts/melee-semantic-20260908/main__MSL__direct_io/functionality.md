## direct_io.c

The unit implements `fwrite`; its canonical and rendered names agree, with no substitutions or renderer errors. The existing name and five complementary facts remain supported. One purpose fact needs correction: orientation initialization is conditional, and direct output has no large-request threshold.

`fwrite` queries orientation and requests narrow orientation only when the query returns zero. It computes `memb_size * num_memb`, rejecting a zero byte count, an existing error, or a closed stream. Console streams register stdio exit handling. A neutral stream with `io_mode & 2` enters `__writing` and prepares its buffer; a stream still not writing is marked erroneous and rejected.

Buffering is selected for nonbinary streams, unavailable files, or numeric buffer modes 1 and 2. Existing buffered data also causes entry into the copy path. Copied bytes are counted before flushing. A full unavailable-file buffer causes the remaining bytes to be counted without copying them. Otherwise a full buffer or numeric mode 0 triggers flushing; failure marks the stream erroneous, clears available length, and stops further output without undoing previously counted copies.

If bytes remain and buffering was not selected, the routine temporarily installs the caller's remaining range as the FILE buffer and invokes `__flush_buffer` with a byte-count output. It adds that reported count even on failure, restores the persistent buffer address and size, and calls `__prep_buffer` to rebuild bookkeeping. This is a temporary cross-function borrow, not a persistent transfer of buffer ownership; callback internals are not established by this file.

On exit, buffer length is cleared unless numeric mode 2 applies. The result is exactly `(bytes_written + memb_size - 1) / memb_size`, not a floor count of complete elements. Numeric mode meanings and arithmetic-overflow behavior are not normalized into stronger claims.

Evidence: [complete implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/direct_io.c#L8-L116).

Status: synthesized; independent review and live promotion pending.
