## Toy Gallery mode

`gmtoygallery.c` defines `gm_Mode_ToyGallery_States`, exported through the header. Its explicit state entry contains numeric values `0`, `lbDvdPreload_2`, and `0`, a null callback slot, `onExit`, and nested values `GS_TOY_GALLERY`, `NULL`, and `&exit_data`; it is followed by `{ -1 }`. These numeric initializers are preserved without assigning additional undocumented meanings. [Table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoygallery.c#L11-L25) · [Export](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoygallery.h#L1-L8)

`onExit` has the signature `void(GameModeState*)`, with internal linkage established by its preceding static declaration. It does not read its argument. Every invocation calls `gm_SetPendingGameMode(GM_MENU)` and then `gm_SetNewGameModePending()`. There are no local guards, alternate branches, return values, or cleanup operations. This is a request for a pending menu transition, not evidence that the transition completes synchronously. Its registration supports the Trophy Gallery mapping and contradicts the stale Event Match link. [Declaration and complete implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoygallery.c#L6-L31)

The file also defines three two-element `UNK_T` arrays with static storage duration: internal `exit_data` and `toy_lottery_exit_data`, and externally linked `toy_collection_exit_data`. Only `exit_data` is referenced by this file's table. The source establishes neither their pointee ownership nor their cross-file initialization and consumption protocols. No compiled section placement or layout is inferred from the address comments or the `.data`/`.sbss` subject names. [Storage declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoygallery.c#L6-L22)

Both complete rendered views matched canonical spelling, with zero substitutions and zero reported parse errors. Rendered names were not used as independent semantic evidence.

Status: synthesized; independent review and live promotion pending.
