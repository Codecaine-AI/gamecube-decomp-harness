## Aligned-word byte access helpers
`src/MetroTRK/ppc_mem.h` defines two static inline helpers. Both truncate the pointer to `u32` and clear its low two bits to select an aligned word. The byte offset determines a shift of 24, 16, 8, or 0 bits, matching big-endian byte ordering.

- `ppc_readbyte1` loads the aligned `u32`, shifts the selected byte into the low bits, and returns it as `u8` ([canonical lines 6–10](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/ppc_mem.h#L6-L10)).
- `ppc_writebyte1` reads the aligned word, constructs the selected byte mask, and writes a replacement word preserving the other three bytes. Despite its `const u8*` parameter, it casts to a writable `u32*` and modifies memory ([canonical lines 12–19](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/ppc_mem.h#L12-L19)). This is a whole-word read-modify-write, not a byte store; the source provides no synchronization, volatile access, or error handling.

The existing function names fit these operations. The rendered view leaves both names unchanged. There are no baseline subjects, facts, or links to correct or retain, and no proposals are warranted.

Status: synthesized; independent review and live promotion pending.
