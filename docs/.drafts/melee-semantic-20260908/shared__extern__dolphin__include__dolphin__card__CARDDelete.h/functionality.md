### CARDDelete.h
This guarded header declares four card-deletion interfaces: `CARDFastDeleteAsync(s32 chan, s32 fileNo, CARDCallback callback)`, `CARDFastDelete(long chan, long fileNo)`, `CARDDeleteAsync(s32 chan, char *fileName, CARDCallback callback)`, and `CARDDelete(s32 chan, char *fileName)`. The fast interfaces take a file number; the other pair takes a mutable character pointer named `fileName`. Both Async declarations accept a callback. Preserve the explicit type distinction: `CARDFastDelete` returns and accepts `long`, whereas the other declarations use `s32` for their return values and numeric parameters. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/card/CARDDelete.h#L1-L9.

Canonical and rendered content were read completely. The rendered declarations match canonical source, with zero substitutions or parse errors. The renderer's unrelated `callback` symbol association is an annotation issue, not evidence of a relationship to fighter code. Existing interface names are consistent with the declaration surface; no supported correction is needed. No baseline subjects, facts, or links exist in this assignment.

This header contains no implementation: return-code meanings, callback timing, error branches, synchronization behavior, and resource lifetimes cannot be established from these declarations. No compiled-layout or behavioral implementation claims are made.

Status: synthesized; independent review and live promotion pending.
