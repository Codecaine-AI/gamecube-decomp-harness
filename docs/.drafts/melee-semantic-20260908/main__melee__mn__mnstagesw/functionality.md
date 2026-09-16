## Random Stage Switch

This unit constructs and operates the 29-entry Random Stage Switch menu. Display positions map through `mnStageSw_803ED4C4` to stage-mask indices; availability is checked separately from inclusion. The icon table is indexed by the mapped stage index, with resource `0x25` used for unavailable entries. The list has 15 left-column entries and 14 right-column entries.

### Input and persistence

The controller GObj is separate from the display GObj published through `mnStageSw_804D6BF0`. Back (`0x20`) precedes the startup gate: it commits cached settings, requests deferred saving, sets cooldown 5, returns to Additional Rules, and removes the controller object. When the gate is clear, confirmation (`0x200`) changes shared `confirmed_selection`, refusing to disable the last cached enabled entry. Its immediate persistence loop writes the existing cache, including after a rejected toggle; the visual callback subsequently copies the shared value into that cache. Start (`0x100`) commits and requests saving before choosing the `GM_MENU` versus other-mode route. A save request is not proof of completed card I/O.

Vertical navigation wraps within its current column and skips unavailable entries. Horizontal navigation searches the other column by increasing distance, preferring the lower index on ties; an empty destination column produces `-1`. The bottom-left entry legitimately requests index 29. Arbitrary larger byte inputs are not safely bounded by the helper.

### Presentation and lifetimes

Construction allocates `MnStageSwData`, registers `HSD_Free`, resolves six model joints, creates 29 entry models, and initially hides both columns and the cursor. Text objects are created only when entry state 1 or 3 completes. These states return to 0 and release the startup gate. A menu mismatch in state 0, 1, or 3 selects exit state 4 when `entering_menu` is nonzero, otherwise state 2. States 2 and 4 remove all 29 texts and the display GObj at completion. Descriptor mapping is 1→1, 3→2, 2→3, 4→4; descriptor 0 maintains the hover loop.

Selection refresh transfers the old hover marker's animation frame to the new marker, positions the cursor from column anchors, and applies frame 0 or 1 to the selected entry's toggle child. Cache writes follow presentation refresh. The cached-menu update branch is present, but the immediately preceding mismatch transition assigns only state 2 or 4, so its subsequent 0/1/3 test does not succeed on that path.

Additional Rules explicitly hands control to this initializer and removes its own controller. Display and controller destruction are not interchangeable. The display global is not cleared locally after destruction. Early Back is permitted before text creation, while exit cleanup unconditionally consumes text pointers; safe scheduling or initialization for that exceptional path is not established here.

### Semantic review

Existing function names generally fit canonical behavior and are retained. The unnamed placement helper can usefully be named `mnStageSw_PositionSelectionCursor`. Two explanations need correction: immediate confirmation persistence versus delayed cache synchronization, and the nearest-entry helper's input-domain limitation. Eight compiled-layout-dependent facts and one literal-pool link remain unresolved rather than being asserted from source alone. All 89 facts and 18 links have explicit checkpoint dispositions.

Canonical evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnstagesw.c#L86-L152`, `#L154-L387`, `#L391-L648`, and `#L650-L807`; stage-mask and availability implementations at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L2178-L2285`; Additional Rules handoff at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnruleplus.c#L183-L192`; deferred save handling at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L162-L224`.

Status: synthesized; independent review and live promotion pending.
