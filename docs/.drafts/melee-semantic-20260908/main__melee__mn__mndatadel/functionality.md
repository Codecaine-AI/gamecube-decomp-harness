## Erase Data subsystem

The unit constructs and operates a six-option deletion screen, its selection descriptions, and a shared Yes/No warning modal. Entry sets menu ID 0x18, saves the previous menu, initializes cooldown to 5, loads twelve archive resource pointers through three model descriptors, constructs the screen with option 0 selected, and immediately creates a separate input GObj. The display GObj owns the shared menu user data; input callbacks obtain that state through mnDataDel_804D6C68 rather than their callback argument.

### Display and input lifecycles

The display starts with fn_8024FD40, advancing the root and six option anchors over the entrance settings. Exact equality with the entrance endpoint switches to fn_8024FC48, which updates selected/unselected option animation. Either display callback switches to the exit callback if the current menu changes and releases the description text. The exit callback removes the display GObj when its root frame reaches or exceeds the exit endpoint. This display sequence is independent of input-process startup.

Main input first handles cooldown, then prioritizes Back, eligible Confirm, Up, and Down. Up/Down wrap the selection across 0..5 and replace its description. Confirmation is allowed only when the selected completion byte is zero. The warning starts with response 0; horizontal input toggles between 0 and 1. Confirm takes priority over Back in both warning handlers.

### Confirmation and reset behavior

Entries 0..4 dispatch individual reset sequences after affirmative confirmation and mark the corresponding option complete. Entry 1 calls mnDataDel_8024E940: canonical foreign code establishes that its reset clears the stage-unlock mask, while its 29-entry scan checks stage availability and selection-mask bits. If none qualify, it enables selection-mask bit 0. The rendered name EraseHiddenCharacters therefore misidentifies this action.

Affirmative entry 5 does not reset data immediately. It changes warning state to 2, resets the response to 0, replaces warning text with SIS 319, installs the final-confirmation handler, and overwrites the initially assigned cooldown 5 with 10. Final affirmative confirmation invokes the all-data action. That action marks all six options complete, performs the reset/reinitialization calls, preserves saved language, chooses the appropriate completion-audio branch, and performs subsequent configuration and card-time updates. These calls do not by themselves prove a physical memory-card file deletion.

### Warning and ownership details

Warning state 1 selects SIS 318; other nonzero values select SIS 319. Opening animation and steady cursor presentation are separate branches. Clearing visibility causes warning text removal, clears its global pointer, and removes the warning GObj. Construction hides the arrow and progress bar and swaps Yes/No X positions for saved US language. Description text is a separate pointer in screen user data. User data is registered with HSD_Free; the shown screen teardown does not clear the global screen pointer, and the independent input GObj's later lifetime depends on external menu machinery.

### Semantic assessment

All owned canonical and rendered pages, all 31 subjects, all 105 facts, and all 28 links were reviewed. The checkpoint ledger explicitly retains 93 facts and all 28 links, supersedes six factual explanations/names, and leaves six section-related facts unresolved. Other rendered function names fit their canonical behavior and are retained. Rendering reported no parse errors; it substitutes function names only, so unchanged fields, parameters, and section labels were assessed from canonical source rather than treated as rendered validation. No compiled section extent, alignment, padding, or physical adjacency is established by this review.

Status: synthesized; independent review and live promotion pending.
