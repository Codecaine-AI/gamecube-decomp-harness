## OSCache.h
This guarded Dolphin header includes dolphin/types.h and declares cache interfaces; it contains no function implementations. The DC range operations cover invalidate, flush, store, flush/store NoSync variants, zero, and touch; ICInvalidateRange is also declared. All take a void* address and u32 byte count and return void (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSCache.h#L1-L13).

LC_BASE_PREFIX is 0xE000, LC_BASE shifts that prefix left 16 bits, and LCGetBase casts LC_BASE to void*. The LC declarations include enable/disable, block load/store with distinct tag/address parameters, byte-count load/store returning u32, queue length returning u32, queue wait taking u32 len, queue flush, and __OSCacheInit (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSCache.h#L15-L28). The declarations do not establish block size, return-value meaning for data transfers, alignment requirements, synchronization details, queue thresholds, or resource lifetimes.

The entire canonical and rendered header was reviewed. Rendering reports zero parse errors and zero substitutions; names remain unchanged and are consistent with the declared interface. No owned baseline subjects, facts, or links exist, and no supported correction warrants a proposal.

Status: researched; no-change lead bypass; independent review and live promotion pending.
