## CARDFormat semantic review

The complete canonical and rendered file was reviewed. Existing function names fit their behavior; the rendered view made no substitutions and reported no parse errors. Seventeen facts and all six links are retained; one data-flow fact needs correction.

### Initialization and APIs
`__CARDFormatRegionAsync` acquires the channel control block and prepares a new identity, two empty directories, and two FAT images in `workArea`. The identity receives encoding, size, time, VI status, SRAM counter bias/language, and time-transformed channel flash-ID bytes. Block count instead determines the FAT free-block count. Each directory/FAT pair has check codes 0 and 1, rather than identical check codes. The function checksums the images, installs the supplied or default callback, calls `DCStoreRange`, initializes the format step, and launches the first erase. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDFormat.c#L51-L128)

`CARDFormatAsync` supplies `OSGetFontEncode()` and returns the immediate startup status. `CARDFormat` supplies `__CARDSyncCallback`, returns immediately on startup failure, and otherwise calls `__CARDSync`. These call sites establish the synchronization handoff without independently proving the external helpers' implementations. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDFormat.c#L130-L142)

### Continuation and lifetime
`formatStep` aliases `mountStep`; it is not a separate demonstrated control-block field. After each nonnegative completion, `FormatCallback` increments the step, erases remaining system sectors, then writes prepared system blocks. Sector addresses use `sectorSize`, whereas write lengths and work-area strides use `CARD_SYSTEM_BLOCK_SIZE`. Accepted dispatch returns without releasing the control block, leaving the stored callback and work-area images available to the continuation. Thresholds remain expressed as `CARD_NUM_SYSTEM_BLOCK` and twice that constant. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDFormat.c#L7-L34)

Successful finalization points `currentDir` and `currentFat` at the first buffers but copies the second buffers into them. A negative incoming result or negative immediate continuation-dispatch result skips successful activation and reaches common cleanup: save and clear `apiCallback`, release the control block, assert the saved callback, then invoke it. Initial erase-start failure is different: the starter calls `__CARDPutControlBlock` and returns, without explicitly clearing or invoking `apiCallback` locally. Acquisition failure returns before preparing metadata. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDFormat.c#L12-L49) · [Startup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDFormat.c#L64-L127)

Formatting here destroys the prior logical filesystem by replacing system metadata; it does not demonstrate secure erasure of every data sector. No compiled section or binary-layout claims are made.

Status: synthesized; independent review and live promotion pending.
