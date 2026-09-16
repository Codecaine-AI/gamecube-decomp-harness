## CARDOpen.h
This guarded header declares three signed-32-bit-returning memory-card API entry points: `CARDFastOpen(s32 chan, s32 fileNo, CARDFileInfo *fileInfo)`, `CARDOpen(s32 chan, char *fileName, CARDFileInfo *fileInfo)`, and `CARDClose(CARDFileInfo *fileInfo)`. The opening declarations distinguish a numeric file selector from a mutable character-pointer filename; closing takes only the file-info pointer. The header supplies neither implementations nor type definitions/includes. It therefore does not establish return-code meanings, validation, handle lifetime, or exceptional-path behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/card/CARDOpen.h#L1-L9.

The full rendered view matches the canonical declarations, with no substitutions or parse errors. Existing API names are appropriate to the declared interface; no supported correction is needed. There are no owned baseline subjects, facts, or links to disposition.

Status: researched; no-change lead bypass; independent review and live promotion pending.
