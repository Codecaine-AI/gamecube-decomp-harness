# MWCC Allocator Tests

These stdlib-only tests cover both accepted compiler hashes, allocator and coloring schema reference validation, per-vreg coloring diffs, JSON CLI output, capture argument rejection, the no-qemu/gdb provisioning response, and function ordering from a synthetic 32-bit big-endian PowerPC ELF symbol table. Live qemu+gdb capture cannot run in CI or on the normal macOS host; the sandbox-image smoke check covers that path instead.

`test_analyze.py` checks offline modes, replay disagreement, malformed and missing
inputs, path/symlink boundaries, output collision, size limits, and vendor hashes.
`test_trace_capture.py` checks modern stage/artifact retention, source identity,
Linux/hash gating, and cleanup command construction without executing MWCC.
