## Bonus-information developer overlay

`dbbonus.c` implements a controller-selected, two-panel DevText bonus inspector. External setup and frame dispatch require `DbLevel >= DbLKind_DebugRom`; setup obtains `db_bonus_names` from `DbCo.dat`. The dispatcher checks all four player slots, but refreshes input for only two when either Hand boss is present. [Dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L63-L256)

### Initialization and storage

`fn_SetupBonusInfo` initializes the selected-player byte to `0xFF`, clears the palette bit and allocates two records, each containing a `DevText*` and a 1500-byte backing buffer. Panels have IDs 10/11, origins `(0,0)` and `(300,0)`, dimensions 25×30 and scale arguments 12/16. Successfully created objects are registered and styled independently, with hidden cursors. Palette zero is transparent black background with opaque red foreground; palette one is translucent purple background with opaque black foreground. Setup does not hide text or backgrounds: inactive selection, cleared buffers and transparent background explain the initial presentation. [Setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbbonus.c#L14-L63), [Creation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib.c#L35-L83)

### Input and state transitions

`fn_CheckBonusInfo` tests B in the stored held mask and D-pad left in the stored pressed mask. Activating a different slot selects it and shows both panels while preserving the palette. Activating the selected slot changes palette zero to one; activating it with palette one clears selection to `0xFF`, resets the palette bit and hides both backgrounds and text. Switching players while palette one is active therefore makes the new player's next activation close rather than recolor. For a still-selected slot, `pl_80039450` is called only if `Player_GetEntity` is nonnull, but rendering starts regardless of that entity check. [State and checker](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbbonus.c#L108-L155)

### Rendering and pagination

`fn_80228E54(player, panel, first_bonus)` erases the indexed panel and scans inclusively through bonus `0xD6`, omitting zero-valued entries. Decision type zero prints only the name; other types print the name and returned value. Panel zero reserves three logical rows for four player-associated numeric values and the player/panel heading. At logical row 30, another nonzero entry continues on panel one at the same unprinted bonus ID; overflow there prints `screen over!!` and returns. Logical row counting does not guarantee that long formatted strings occupy one physical row. The cursor setter clamps row 30 to the last valid row. [Renderer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbbonus.c#L65-L106), [Cursor clamp](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib.c#L114-L128)

Only panel zero is necessarily erased on each selected-slot check. Panel one is erased only when overflow recursion reaches it, so old contents can persist when a subsequent listing fits on panel zero. Selection and visibility changes do not clear those contents.

### Exceptional paths and lifetimes

Heap allocation is unchecked before indexed use. Null DevText creation skips configuration for that slot, but later toggle and rendering paths do not guard stored text pointers. DevText retains the supplied backing-buffer pointer. There is no local teardown or repeated-setup guard; each setup allocates anew and overwrites the retained array pointer. Global teardown and allocator lifetime remain unverified, so no global leak or use-after-free conclusion is asserted. [Local lifetime](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbbonus.c#L22-L155), [Retained buffer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib.c#L75-L83)

### Semantic review

The tentative rendered local names `fn_InitBonusInfoState`, `fn_SetupBonusInfoText`, `fn_PrintBonusInfo` and `fn_ToggleBonusInfo` fit the independently inspected canonical behavior and are retained. Existing useful parameter-role explanations and all unchanged supported research findings are retained without redundant writes. External rendered names are not proof of complete callee semantics.

The inherited complete ledger accounts for 57 facts: 36 retained, 19 unresolved and two superseded; all nine links are accounted for: seven retained and two unresolved. Independent lead review accepts both factual corrections and all compiled-section deferrals. Source declarations, argument order and address-like symbol spelling do not establish section placement, extents or ordering; competing `.data`/`.sdata` palette claims remain unresolved.

Status: synthesized; independent review and live promotion pending.
