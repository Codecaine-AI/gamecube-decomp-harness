## Memory-card deletion

The unit implements named and directory-slot deletion, each with asynchronous and blocking forms. Existing function names and baseline explanations fit canonical behavior; no semantic renaming is warranted.

`CARDDeleteAsync` acquires channel control, resolves the filename, and rejects an open file with `CARD_RESULT_BUSY`. `CARDFastDeleteAsync` instead validates the slot range, acquires control, checks entry access, and rejects an open file. Both preserve the entry's `startBlock` in `CARDControl`, fill the directory entry with `0xFF`, install the supplied callback or default, and start `__CARDUpdateDir` with `DeleteCallback`. Initiation errors release acquired control as appropriate and return directly; these paths do not explicitly invoke the API callback. Directory-update initiation failure does not locally undo the entry mutation or clear the installed callback. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDDelete.c#L31-L98)

`DeleteCallback` retrieves and clears `apiCallback` before inspecting the incoming result. A negative directory-update result skips reclamation. Otherwise it passes the preserved start block and saved callback to `__CARDFreeBlock`; a nonnegative start result delegates completion rather than completing locally. Either negative branch releases control before conditionally notifying the saved callback. These comparisons distinguish negative from nonnegative statuses, not an exhaustive set of numeric states. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDDelete.c#L9-L29)

The blocking wrappers supply `__CARDSyncCallback`, return immediately on negative initiation results, and otherwise call `__CARDSync`. [Fast wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDDelete.c#L63-L70) · [Named wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDDelete.c#L100-L106)

Cross-file control handling validates channel acquisition, marks ownership busy, and publishes release results under interrupt protection while preserving an already-published detached-card state. The deletion unit therefore coordinates lifetimes across directory update and block reclamation; it does not itself establish rollback or atomic durability guarantees. [Control handling](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/CARDBios.c#L649-L696)

The rendered view matches canonical function names with zero substitutions and zero parse errors. Its unrelated shadowed `callback` candidate is not evidence of a cross-unit relationship. All 14 baseline facts and four links are explicitly retained in the checkpoints. No compiled section or layout conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
