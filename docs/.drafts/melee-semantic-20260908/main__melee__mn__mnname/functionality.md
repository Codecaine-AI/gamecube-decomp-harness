## Name Entry management

This unit manages persistent player-name profiles and the saved-name browser, while delegating keyboard editing to `mnnamenew.c`. It provides occupancy checks, nullable borrowed-name access, a 120-slot count/capacity query, encoded-string comparison, display-order sorting, deletion maintenance, controller dispatch, animated presentation, resource loading, and reconstruction on return from the editor.

### Persistent names

`IsNameValid` checks only whether the first stored byte differs from the terminator; it does not validate name content or check the slot range. `CompareNameStrings` orders ordinary bytes unsigned and returns 0 for equality, 1 for greater, and 2 for less. A remaining suffix consisting entirely of Shift-JIS full-width spaces compares equal to termination. The existing rendered name `IsNameInUse` accurately describes `IsNameUnique`: true means a duplicate was found, and scanning stops at the first unoccupied slot. Counting, by contrast, examines all 120 slots.

Sorting changes only the 120-byte display permutation. Zero sort mode restores identity order; nonzero mode compares occupied names and puts empty entries last. Deletion is a coordinated operation: the confirmation caller clears and initializes the selected record before `DeleteName` shifts the corresponding u16 column in occupied records and compacts whole records into holes. The caller then sorts, refreshes, repairs scrolling, and notifies game state.

### Browser and input

The viewport has four horizontal columns of six rows, totaling 24 name cells. Commands 24, 25, and 26 enter new-name creation, toggle sorting, and enter the saved-name grid respectively. Back from the grid selects command 26; back from a command exits. Occupied-name confirmation opens the deletion modal, initially selecting cancellation. Invalid or unavailable actions play the error sound.

Scrolling advances one six-name column, with cyclic wraparound when more than four columns exist. `mnName_GetPageCount` separately computes `ceil(valid_count / 24)` and is used as a nonempty-list guard. The scrollbar uses `ceil(valid_count / 6)` and positions its slider at `column_offset * 14 / (column_count - 1)` only above four columns.

The input process dispatches shared mode 0 to the browser, 1 to the editor, and 2 to deletion confirmation; other values produce no call. Presentation transition states are a separate numeric domain: states 1 and 3 finish at idle, whereas 2 and 4 remove the host GObj.

### Presentation and lifetimes

The main constructor publishes a host GObj and attaches an explicitly allocated 0x44-byte state block. Many helpers receive that GObj-shaped state block directly, whereas sorting and visual-process routines receive the host and dereference its user data. Existing names generally fit these roles and were retained rather than rewritten for style.

List construction creates 24 animated child models and a retained SIS text object. Clear and rebuild paths remove the generated sibling chain and independently destroy and null the text pointer. Hide mode performs cleanup; other modes rebuild before updating the scrollbar. Selection updates preserve the special exception that command 26 is not deactivated when entering a name cell. The selection-animation routine ignores its third argument and can remove its host at the terminal animation window. The node lookup propagates NULL during child traversal but returns the input pointer cast to `HSD_JObj*` for indices outside 0–26.

The deletion modal creates its prompt when animation progression crosses the configured endpoint, updates complementary yes/no frames outside that interval, and removes text and its GObj when mode 2 ends. Saved-US-language setup swaps the two choice joints' X positions.

### Cross-file resources

The initializer loads three management model bundles and four shared editor resource groups. The shared descriptors are defined here and consumed by the editor, keyboard, and glyph-variant constructors; both menu entry paths load them. Only element zero of the two-element descriptor array is explicitly loaded by these paths. Automatic and refused-name lists are selected by saved language. Editor confirmation rejects empty, all-space, duplicate, and prohibited candidates before initializing and writing a persistent profile. Returning from a successful creation in a list larger than 24 names supplies `name_index / 6`; other menu returns supply zero.

The count and borrowed-name accessors also serve Records headers, name-mode availability, scrolling controls, and the `NAME_TOTAL` row.

### Review outcome

All 234 baseline facts were explicitly assessed: 224 retained, five superseded explanations, and five unresolved compiled-layout claims. All 58 baseline links were explicitly retained. Five factual replacements are proposed; no naming-only churn or relationship additions are proposed. Source declarations and address comments were not treated as proof of compiled section sizes, physical adjacency, or exhaustive section contents.

Status: researched; no-change lead bypass; independent review and live promotion pending.
