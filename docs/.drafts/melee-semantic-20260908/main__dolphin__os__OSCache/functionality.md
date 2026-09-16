## OSCache semantic review

This translation unit implements Dolphin OS processor-cache infrastructure, not gameplay logic. All 667 canonical and rendered lines, all 41 subjects, all 93 facts, and all 22 links were reviewed. Existing SDK function names fit their canonical behavior; no renaming is proposed. The rendered view made no substitutions and reported 378 parse errors, so it does not independently validate assembly identities or parameter names.

### L1 maintenance and coherence
The data-cache APIs distinguish invalidation (`dcbi`), flush (`dcbf`), store without invalidation (`dcbst`), zero (`dcbz`), and touch (`dcbt`). Range traversal uses 32-byte strides. A zero byte count returns before cache operations or trailing barriers. Unaligned starts add a full 32 bytes before rounding, rather than the actual address offset; this is conservative coverage, not a minimal interval normalization. Arithmetic wraps at 32 bits, and a computed zero CTR does not skip the post-tested assembly loop.

`DCFlushRange` and `DCStoreRange` finish with `sc`; the installed OSSync system-call vector supplies synchronization and restores its saved HID0 image. The NoSync variants leave ordering to callers. `ICInvalidateRange` finishes with `sync` and `isync`; `ICFlashInvalidate` only sets HID0's flash-invalidate bit and has no internal barrier. ARAM probing and HIO transfers demonstrate data coherence, while exception-vector installation and reboot loading demonstrate executable publication. These operations do not themselves establish an asynchronous buffer's completion or release lifetime.

### Locked cache and DMA
`LCEnable` saves the external-interrupt enable state, runs `__LCEnable`, and restores that state. The internal routine changes MSR and HID2, prepares 1024 ordinary cache lines, programs DBAT3, and initializes 512 locked-cache lines. Its two twelve-nop sequences establish instruction counts, not measured elapsed cycles. The wrapper does not restore the complete MSR or prior DBAT mapping. `LCDisable` invalidates 512 lines before clearing the locked-cache enable bit; it neither drains the DMA queue nor reverses all initialization state. The reset caller invokes it after the final reset-callback pass.

`LCStoreBlocks` packs a command into DMA_U and DMA_L and returns without waiting or enforcing queue capacity. `LCStoreData` submits full 128-block chunks using encoded count zero and advances both endpoints by 4096 bytes; a final partial chunk uses its explicit count. Its returned transaction count is not a completion acknowledgment. `LCQueueWait` polls a four-bit HID2 field using a signed comparison against a wrapping incremented threshold; ordinary queue-domain behavior must not be extrapolated to every u32 input.

### Startup and exceptional paths
`__OSCacheInit` independently checks L1 instruction, L1 data, and L2 enable bits, initializing only disabled caches, then unconditionally installs `DMAErrorHandler`. It does not enable locked cache. L2 initialization temporarily changes MSR and restores it after invalidation; startup subsequently enables L2. Global invalidation retains both polling phases, including the diagnostic loop for unexpectedly persistent status after clearing the invalidate request.

`DMAErrorHandler` requires both a recognized HID2 error flag and the saved SRR1 DMA indicator. It independently reports all asserted recognized causes and writes back the captured HID2 image. If either classification condition is absent, it dumps context and enters the nonreturning PPCHalt path.

### Disposition summary
The checkpoint explicitly retains 84 facts and 19 links, supersedes five factual explanations, and leaves four .data facts and three .data links unresolved. Source diagnostic usage is supported, but no compiled evidence establishes the asserted section membership, 560-byte extent, or four-byte string layout. No section-layout conclusion or source/KB write was made.

Status: synthesized; independent review and live promotion pending.
