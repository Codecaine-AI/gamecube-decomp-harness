# Debug startup and frame dispatch

Pinned `c302741689bd67c361cd7faadb221df3193992c3`; full C1-257 canonical/rendered read. Manifest owns no header. Receipt snapshots: `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__db__dbinit/pages/`.

## `.bss`

Stores the per-controller button history and derived transition masks used by the developer-debug subsystem's input accessors and per-frame feature dispatcher.

Setup clears current, pressed, released and repeat for all four records but leaves prev untouched. Each enabled frame copies processed slots current into prev, stores filtered button input, derives pressed=current & ~prev and released=prev & ~current, and stores separately filtered repeat. Only slots 0-1 update when either Hand boss is present; slots 2-3 retain prior state even though all feature loops still visit them. Accessors return stored masks without consuming or refreshing them.

The records are refreshed only while developer-debug processing is enabled at `DbLevel >= DbLKind_DebugRom`. For each processed controller, `pressed` contains clear-to-set transitions, `released` contains set-to-clear transitions, and `repeat` follows the normalized controller repeat mask. Four records are normally refreshed, but only the first two are refreshed while Master Hand or Crazy Hand is present.

An array of four 0x14-byte records. Each record contains five 32-bit `HSD_Pad` masks at offsets 0x0, 0x4, 0x8, 0xC, and 0x10, representing `current`, `prev`, `pressed`, `released`, and `repeat`; the complete array occupies 0x50 bytes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L20-L26, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L78, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L229, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.h#L11-L16.

## `.data`

Holds the module's initialized build-identification text, debug archive lookup strings, and diagnostic report headings and format strings.

The `DbCo.dat` and `dbLoadCommonData` strings are passed to `lbArchive_LoadSymbols`, while the diagnostic headings, separator, and format strings flow to `OSReport`. The build timestamp remains embedded build-identification data and is not read elsewhere in this translation unit.

The timestamp array and embedded strings are statically initialized and are not mutated by this translation unit after startup; the archive and report strings are read when their corresponding setup or diagnostic routines execute.

Existing source/target .data extents are 223/224 bytes. Contents are the 32-byte timestamp array, DbCo.dat at offset 0x20, dbLoadCommonData at 0x2C, entity heading at 0x40, separator at 0x60, thread heading at 0xA0 and stack report format at 0xBC, plus padding. Short strings %5d and newline are in .sdata, not here. Object build provenance against the pinned revision is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L18-L18, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L80-L81, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L119-L138, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L147-L150.

## `.sbss`

Provides zero-initialized small-data storage for shared startup and developer-debug state: one unresolved boolean flag, pointers to the bonus, motion-state, and submotion name tables, and the controller button mask captured when the game launches.

`db_GetGameLaunchButtonState` polls four controllers, stores the first usable controller's button mask into `db_gameLaunchButtonState` or zero if none is usable, and then waits for Memory Card A probing to leave its busy state. Separately, `db_Setup` loads `dbLoadCommonData` from `DbCo.dat` and publishes its three name-table pointers through `db_bonus_names`, `db_motionstate_names`, and `db_submotion_names`.

All members begin zeroed. Launch polling replaces the launch-button field with the first usable controller's mask or explicitly leaves it zero when no controller is usable. The three name-table pointers remain null unless setup runs with `DbLevel >= DbLKind_DebugRom`, at which point they receive pointers from the loaded debug common-data archive. No transition for the unresolved boolean is shown in this unit.

The source-object .sbss extent is 18 bytes and the target extent 24 bytes. Payload is bool db_804D6B20 at +0, three char** pointers db_submotion_names/db_motionstate_names/db_bonus_names at +4/+8/+12, and u16 db_gameLaunchButtonState at +16. The target trailing six bytes are padding, not additional inferred fields. Build provenance is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L10-L14, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L31-L61, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96.

## `.sdata`

Stores DbLevel, the mutable enum setting that gates debug setup and frame dispatch, plus the short OSReport count-format and newline strings in the existing object snapshots.

DbLevel begins at DbLKind_NoDebugRom=1; setup and frame dispatch require DbLKind_DebugRom=3 or higher. This TU does not change DbLevel after initialization. Existing .sdata also supplies "%5d " for the entity-count table and newline strings for diagnostic output.

The initial value `DbLKind_NoDebugRom` places the central debug subsystem below its enabled threshold. Values below `DbLKind_DebugRom` suppress setup and per-frame processing, while that level or higher enables resource and feature initialization and permits the per-frame dispatcher to run.

Existing source .sdata has 14 bytes and target has 16: DbLevel is the four-byte initialized value 1 at offset 0, the NUL-terminated format "%5d " begins at offset 4, and the NUL-terminated newline begins at offset 12. Remaining bytes are alignment padding. Object build provenance is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L16-L16, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L11-L17, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L119-L138, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L168-L170.

## `db_ButtonsDown`

Provides debug-feature code with the complete button mask currently held for a selected controller/player slot, complementing the edge-triggered and repeat-state accessors used by the same subsystem.

`db_RunEveryFrame` obtains each processed slot's raw button state from `HSD_PadMasterStatus`, removes conflicting diagonal D-pad pairs, and stores the normalized mask in `db_ButtonStates[i].current`. `db_ButtonsDown(player)` returns that mask unchanged to debug handlers that combine it with pressed-edge masks to recognize held-button chords.

The function is a read-only snapshot accessor: it neither advances nor clears input state, so a bit remains present while it remains in the selected slot's per-frame `current` mask. It performs no debug-level or index guard; refresh and subsystem gating occur in `db_RunEveryFrame` at the `DbLKind_DebugRom` threshold.

Signature: `HSD_Pad db_ButtonsDown(int player)`. `player` is an array index selecting a controller/player debug-state record, and the return value is an `HSD_Pad` button bitmask rather than a Boolean.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L99-L102, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L229, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbsound.c#L117-L138.

## `db_ButtonsPressed`

Returns the selected slot's stored newly-pressed mask from its latest debug input refresh. It does not consume that mask. Slots not refreshed during Hand-boss processing can expose the same stale edge to repeated feature checks.

During `db_RunEveryFrame`, normalized controller input becomes `db_ButtonStates[player].current`, the prior current mask becomes `prev`, and `current & (prev ^ current)` becomes `pressed`. `db_ButtonsPressed` returns that stored mask unchanged to the feature-specific debug routines.

For each slot updated during the latest frame at or above `DbLKind_DebugRom`, the returned mask contains exactly the bits that transitioned from clear in `prev` to set in `current`. Held, released, and unchanged-clear bits are absent. Conflicting diagonal D-pad pairs are removed before the mask is calculated, and the accessor itself is read-only and unguarded.

Signature: `HSD_Pad db_ButtonsPressed(int player)`. The argument is a zero-based controller/player-slot index into the four-entry debug button-state array, and the return value is an `HSD_Pad` bitmask. The accessor performs no bounds check.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L104-L107, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L229, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbsound.c#L117-L138.

## `db_ButtonsRepeat`

Provides debug-feature code with the repeat-triggered controller buttons for one player, allowing a held directional input to continue producing navigation actions rather than acting only on its initial press.

For each processed slot, db_RunEveryFrame reads HSD_PadMasterStatus[player].repeat, applies ordered D-pad bit-clearing tests, and stores the result. Hand-boss processing refreshes only slots 0-1. db_ButtonsRepeat returns the stored field unchanged; the item/Pokemon menu tests its directional bits for repeated navigation.

The function is a stateless read-only accessor that returns the stored repeat mask for the requested slot without validation. The backing state is cleared during setup and refreshed only by `db_RunEveryFrame` at or above `DbLKind_DebugRom`; that routine refreshes two slots when Master Hand or Crazy Hand is present and otherwise four.

Signature: `HSD_Pad db_ButtonsRepeat(int player)`. The parameter is a zero-based controller/player-slot index into the four-element debug button-state array, and the return value is an `HSD_Pad` bitmask.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L109-L112, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L220, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L243-L295.

## `db_GetGameLaunchButtonState`

Samples controller buttons during game launch once all four PAD channels have left transient reset or transfer-error states, stores the first successfully read controller's button mask as the launch-button state, and then delays completion while memory-card channel 0's extended probe returns `-1`.

Each polling iteration waits for a video retrace and fills a four-element `PADStatus` array through `PADRead`. The function examines every record's `err`, then scans from channel 0 upward for the first record with `err == 0`; that record's `button` field flows into `db_gameLaunchButtonState`, or zero is stored if no channel is valid. It subsequently passes temporary memory-size and sector-size outputs to `CARDProbeEx` for card channel 0, using retrace waits between repeated probes.

The routine has two retrace-paced wait phases. In the first, any controller record with error `-2` or `-3` keeps the function in the PAD polling state; it advances only when all four records avoid those transient values. It then chooses the lowest-numbered channel with error zero, falling back to a zero button mask if all four are invalid. In the second phase, `CARDProbeEx` returning `-1` causes another retrace wait and retry; any other result completes the routine.

A parameterless startup routine with signature `void db_GetGameLaunchButtonState(void)`. Its externally visible result is the `u16` global `db_gameLaunchButtonState`; memory-card size and sector size are temporary signed 32-bit probe outputs.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L31-L61, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/pad.h#L55-L58, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/card.h#L149-L154.

## `db_PrintEntityCounts`

Produces a tabular diagnostic snapshot of how many HSD game objects occupy each of the engine's 64 entity-list buckets, allowing developers to inspect object population across those buckets.

For each bucket index from 0 through 63, reads the corresponding head pointer from HSD_GObj_Entities, follows successive `HSD_GObj.next` pointers until NULL while accumulating a local count, and passes that count to OSReport. It formats the results in rows of ten, preceded by column labels 0 through 9 and a separator.

Reads 64 list heads and follows next links to NULL while counting, then prints rows of ten values. It does not modify lists or retain counts, but it has no cycle guard, synchronization or snapshot copy. Normal completion and stable totals assume valid acyclic lists that are not concurrently changed.

Parameterless, no-result diagnostic routine with the interface `void db_PrintEntityCounts(void)`; it reads the global HSD_GObj entity-list table and communicates its result exclusively through OSReport output.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L114-L139.

## `db_PrintThreadInfo`

Reports linker-defined stack capacity and a fill-pattern estimate of peak consumption by scanning from _stack_end + 4 to the first non-0xAA byte. The scan has no upper bound and cannot distinguish untouched fill from used bytes whose value is also 0xAA.

Reads `_stack_end` to seed a byte pointer at `_stack_end + 4`, advances that pointer while the pointed-to byte remains `0xAA`, then combines the resulting boundary with `_stack_addr` and `_stack_end`. It sends `_stack_addr`, `_stack_end`, `_stack_addr - _stack_end`, and `_stack_addr - peak` to `OSReport` as the base, end, size, and peak-use diagnostics.

Scans bytes from _stack_end + 4 while each equals 0xAA, without an upper-bound check against _stack_addr. It reports stack capacity and _stack_addr - peak as a fill-pattern estimate, then returns if a non-AA byte is found and reporting succeeds. There is no bounded-scan or accurate historical-peak guarantee if the fill convention is broken or used bytes happen to equal AA. No persistent game fields are written here.

A synchronous, parameterless diagnostic routine with signature `void db_PrintThreadInfo(void)`. It reads linker-provided byte-array stack-boundary symbols and emits results through `OSReport` without returning a value.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L141-L151, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L98-L132, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L295-L300.

## `db_RunEveryFrame`

Runs the active developer-debug controls once per frame: it updates normalized controller button histories and edge states, then dispatches every per-player debug feature check and the shared CPU-handicap and animation updates.

For each active debug slot, the routine obtains current and repeating pad masks, removes simultaneous vertical-plus-horizontal D-pad diagonals, shifts `current` into `prev`, stores normalized current input, derives pressed and released edges with XOR-and-mask operations, and stores repeat. Camera checks additionally receive current and pressed masks plus normalized C-stick coordinates; the remaining feature modules receive the player index and consume their own debug state.

Returns below DbLKind_DebugRom=3 without clearing stored masks. Otherwise refreshes slots 0-1 when either Hand boss is present, or all four slots otherwise. Unprocessed slots retain current/pressed/repeat values, yet every feature loop still runs for all four indices; camera handling combines those stored masks with current raw normalized C-stick coordinates. CPU-handicap and animation global updates follow their respective four-player checks. D-pad filtering acts independently on button and repeat with ordered bit-clearing tests; it does not suppress opposite directions by themselves.

A parameterless per-frame callback with signature `void db_RunEveryFrame(void)`; its persistent outputs are side effects on global debug button state and the debug feature modules it invokes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L256, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L11-L17.

## `db_Setup`

Initializes the controller-facing developer-debug facilities: it resets all four players' derived debug button states, loads the shared debug-name resource, publishes its tables, and runs the setup routine for each supported debug feature.

When enabled, the function writes zero to the `repeat`, `released`, `pressed`, and `current` masks of all four `db_ButtonStates` entries. It requests symbol `dbLoadCommonData` from `DbCo.dat`, interprets the result as three `char**` tables, publishes them through `db_bonus_names`, `db_motionstate_names`, and `db_submotion_names`, and then transfers control to feature-specific setup routines.

No-op below DbLKind_DebugRom=3. Otherwise clears current, pressed, released and repeat for all four slots, but does not write prev. Loads and directly dereferences commonData without a local failure/null guard, publishes three borrowed name-table pointers, then calls nine setup routines in source order. Repeated calls are not guarded as one-time initialization. No timer or ongoing loop is maintained here.

A parameterless initialization routine with signature `void db_Setup(void)`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L63-L97, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L11-L17.

## `TU`

Provides central initialization and per-frame coordination for Melee's developer-debug subsystem, including launch-input capture, debug-resource loading, feature initialization, button-transition tracking, feature dispatch, and runtime diagnostics.

Setup loads `DbCo.dat`, publishes its bonus and motion-name tables, and initializes debug features. Each enabled frame, pad state is normalized into current, previous, pressed, released, and repeat masks and passed with sub-stick values to feature handlers; object-list and stack-fill diagnostics flow to `OSReport`.

Setup and frame dispatch require DbLevel >= DbLKind_DebugRom=3. Setup clears four masks per slot but preserves prev; each processed frame overwrites prev from current before computing edges. Hand-boss presence limits fresh input to two slots while all feature loops still visit four, leaving slots 2-3 stale. Accessors and diagnostic functions have no internal debug-level gate. Launch polling is independent and has no retry limit.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L31-L256.

## Input filter and dispatch order

D-pad normalization independently edits held and repeat masks. Each up/down branch clears vertical+left, then vertical+right pairs using the updated mask. It leaves pure up+down and pure left+right masks unchanged; for all four directions the up branch clears up/left/right and leaves down. The result is not a generic all-conflicting-input rejector. Edges are derived after filtering, so they describe filtered state transitions.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L176-L220.

Dispatch order is visual effects, camera, sound, allocation limiter, item/Pokemon menu, handicap checks and update, animation checks and update, stage effects, bonus and speed. Each check loop uses all four indices. Camera arguments use stored held/pressed masks and raw normalized sub-stick values.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## Section and boundary review

Existing object extents source/target: .data 223/224, .bss 80/80, .sdata 14/16, .sbss 18/24. Target padding does not define extra state. Short %5d and newline strings share .sdata with DbLevel; long labels and archive names occupy .data. No artwork is embedded. Objects were inspected without a build; provenance remains unverified.

Boot polling waits at least one retrace, retries indefinitely while any PAD channel has -2/-3, captures the lowest valid channel, and waits only while card channel 0 reports busy. Other card errors allow completion. It does not validate card capacity or require a present card. Setup does not clear prev and has no local archive-failure guard. All three button accessors directly index a four-element array without validation.

The stack diagnostic is an unbounded AA-fill scan, not an OS thread enumeration. Object counting follows next links without synchronization or cycle detection. No runtime guarantees were inferred beyond those branches.

## Review state

All 16 subjects, inherited facts and 14 exact outgoing relationships are accounted for. Clear the redundant db_ButtonStates inferred alias because it is already the source identifier. No function renames or foreign proposals.
