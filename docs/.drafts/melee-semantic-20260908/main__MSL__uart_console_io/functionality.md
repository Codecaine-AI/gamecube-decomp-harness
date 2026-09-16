## MSL UART console adapter

The unit supplies console read, write and close callbacks. A shared zero-initialized Boolean caches successful `InitializeUART(0xE100)` calls. Initialization failure returns 1 without changing the caller's count and leaves initialization retryable. Neither transfer failure nor close clears the latch.

`__read_console` saves the requested count, clears the output count, and attempts single-byte reads while the output count is less than or equal to the saved count and the preceding status is zero. Each attempt increments the count, even on failure, and tests the current buffer byte for carriage return before advancing the pointer. Thus zero requested bytes still permits an attempt. The ordinary non-wrapping limit is requested count plus one; at UINT32_MAX, unsigned wrap prevents the count guard itself from terminating processing. Return status reflects the backend status, not whether the count represents successfully received bytes.

`__write_console` submits the entire requested buffer/count. A nonzero backend result clears the count and returns 1; zero leaves the count unchanged and returns 0. Close ignores its argument and returns 0 without cleanup.

The pinned Dolphin backend adds important qualifications: initialization checks console capability bit 0x10000000, `ReadUARTN` is a constant-4 failure stub, and `WriteUARTN` can return zero without transmission when EXI locking fails. When locking succeeds, writing converts LF to CR in the caller's buffer. The adapter's cached initialization state is distinct from the backend's `serEnabled` state.

All existing facts and links are retained. Existing function names fit the canonical and rendered behavior. `initialized` remains a reasonable data-name hypothesis, not a recovered historical spelling. The rendered view has no substitutions or parse errors and covers function names only. No compiled section or layout conclusion is drawn.

Status: synthesized; independent review and live promotion pending.
