# Naming Review

Canonical names remain authoritative. Nine behavior-supported inherited hypotheses are retained as reading aids. ARAM-specific installed-heap wrapper names remain unresolved because their arguments and global slot are not constrained to ARAM by these wrappers.

| Canonical Symbol | Hypothesis | Disposition |
| --- | --- | --- |
| `fn_80015184` | `lbMemory_RamCopyCallback` | retain |
| `lbMemory_80014E24` | `lbMemCreateHeap` | retain |
| `lbMemory_80014EEC` | `lbMemDestroyHeap` | retain |
| `lbMemory_80014F7C` | `lbMemory_GetFreeSize` | retain |
| `lbMemory_80014FC8` | `lbMemAllocFromHeap` | retain |
| `lbMemory_8001529C` | `lbMemory_Compact` | retain |
| `lbMemory_80015320` | `lbMemory_CompactCallback` | retain |
| `lbMemory_800154BC` | `lbMemory_GetArena` | retain |
| `lbMemory_800154D4` | `lbMemCreateARAMHeap` | unresolved |
| `lbMemory_800155A4` | `lbMemDestroyARAMHeap` | unresolved |
| `lbMemory_8001564C` | `lbMemInit` | retain |
