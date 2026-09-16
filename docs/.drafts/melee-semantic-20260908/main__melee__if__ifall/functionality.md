## Common match HUD

`ifall.c` coordinates the common HUD archive, layout anchors, camera, light, visibility controls and component lifecycle. The rendered local names—`ifAll_HideHUDComponents`, `ifAll_ShowHUDComponents`, `ifAll_SetPlayerHUDPositions`, `ifAll_HUDCameraCallback`, `ifAll_InitHUDPositions`, `ifAll_Init` and `ifAll_Free`—fit canonical behavior and are retained as descriptive hypotheses, not recovered original names.

### Visibility

The two component dispatchers call seven subsystem operations in fixed order and do not modify the separate global `hidden` byte. Pause entry calls the hide dispatcher and can immediately restore timers; accepted unpause calls the show dispatcher. Conversely, `ifAll_HideHUD` and `ifAll_ShowHUD` only set the global latch. Clearing that latch permits the common camera pass but does not independently unhide component objects.

The camera callback skips activation while hidden. When visible, it dispatches only if `HSD_CObjSetCurrent` succeeds, then calls `HSD_CObjEndCurrent`. The dispatch mask `0x7` selects callback indices 0–2; the camera's `0xD00` priority bitmap selects GX-link lists 8, 10 and 11. Finalization sorts eligible deferred work, displays it and clears its lists. Activation failure is not necessarily free of baselib state changes: a non-null camera can become current and deferred lists can be cleared before camera setup fails.

### Layout and accessors

Initialization loads `IfAll`, resolves `ScInfDmg_scene_data`, retains the first model's loaded JObj hierarchy and extracts twelve anchors: timer node 13, six player nodes 2–7, three auxiliary nodes 8–10 and two auxiliary nodes 11–12. The temporary GObj created by the extractor is not attached to that hierarchy; destroying it does not release the retained root.

Player-count relayout selects node 9 for count 1, nodes 11–12 for count 2, nodes 8–10 for count 3 and nodes 2–5 for count 4. Both counts 5 and 6 populate all six slots from nodes 6, 2–5 and 7 and multiply every resulting x coordinate by `0.65F`. Counts outside 1–6 perform no anchor writes; smaller valid counts leave unused slots unchanged. Traversal results are not checked before position extraction, so the expected hierarchy is a precondition.

The position accessors return mutable aliases, not copies. Player indices 0–5 select stored anchors; unchecked indexing does not establish defined behavior for arbitrary invalid indices. `ifAll_GetArchive` returns the address of a persistent writable archive-pointer slot. `ifAll_GetHUDGObj` returns the stored camera GObj without validation or ownership transfer. Timer, status and numeric-text consumers confirm these cross-file roles.

### Lifecycle

Aggregate initialization explicitly selects visible state, creates and registers the camera and light, and then initializes component modules. Teardown first invokes an initial component-cleanup sequence, conditionally destroys the stored camera and light, and then invokes the remaining cleanup routines. `un_802FE390` occurs twice. The camera and light fields are not cleared, so repeated safe teardown is not established. This body also does not explicitly release or clear the retained layout hierarchy or archive slot; their complete reclamation lifetime remains outside the demonstrated teardown.

### Review outcome

All 25 subjects, 103 facts and 30 links were enumerated. The checkpoint ledger retains 95 facts and 29 links, marks six compiled-representation facts and one dependent link unresolved, and supersedes two explanations. Source switch cases cannot prove a compiler-emitted jump table; source literals cannot prove small-data section extents or padding. No local name change is warranted. Two factual explanation corrections are proposed below.

Status: synthesized; independent review and live promotion pending.
