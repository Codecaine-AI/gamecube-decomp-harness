## Scene and mode registry configuration

`gmscdata.c` defines two static, non-const descriptor arrays. `scenes` associates GS_* identifiers with lifecycle callbacks and ends with a GS_COUNT record containing null callbacks. `modes` associates GM_* identifiers with metadata, lifecycle callbacks, and externally defined GameModeState arrays, ending with a GM_COUNT record. Scene callbacks are not uniformly present: GS_UNK10 has none, and several scenes lack an on-frame callback. The three game-over modes share a state array; six Multi-Man modes share load/init callbacks but select distinct state arrays.

`gm_GetAllGameScenes` and `gm_GetAllGameModes` directly return the respective array bases. Their existing names accurately describe their behavior. Neither function allocates, copies, validates, dispatches callbacks, or changes routing state. Returned descriptors have static storage duration; subordinate state definitions and callback execution belong to other modules. The header declares both getters and external state arrays, not additional local registry definitions.

Canonical consumers search until count sentinels and return NULL on lookup failure. The mode runner assumes a valid selected descriptor, resets routing indices to numeric zero, passes its preload field to the preload operation, and invokes its optional load callback. During execution, an override may substitute another mode's states, backing up routing and restoring it only when not resetting. Unload likewise requires both a non-null callback and no reset. Startup invokes every non-null mode initialization callback, including shared callbacks once for each registered descriptor. These consumer behaviors are not operations performed by the getters.

All owned canonical and rendered pages and all baseline subjects and links were reviewed through restored evidence. Rendered names were not used as independent proof. Existing configuration, mapping, accessor, and dispatch-pattern knowledge is retained; corrections remove an unsupported compiled-section assertion and preserve exceptional mode-runner branches.

Status: synthesized; independent review and live promotion pending.
