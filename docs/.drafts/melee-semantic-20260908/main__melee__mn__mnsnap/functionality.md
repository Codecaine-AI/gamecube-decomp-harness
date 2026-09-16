## Snapshot album
`mnsnap.c` implements the Data-menu album for stored snapshots on either memory-card slot. The constructor initializes menu kind 0x19, creates four retained presentation GObjs plus a secondary process owner, and registers the main controller and exit handler. Four thumbnail widgets belong to the main hierarchy; the five separately constructed children are action-option objects. The resource stored in `page_joint` becomes the full-view photograph object, not a page indicator.

## Loading and operations
Pages contain up to four photographs. Page setup clears loader flags, installs 64×48 placeholders, hides unused slots and starts page-relative reads. Result 11 leaves a request pending; result 8 triggers recovery. Completion result 0 attempts decoding and installs a 640×480 image on success; decode failures and completion results 2/3 mark entries unusable while advancing. Other completion statuses reset to slot selection. The controller drains pending thumbnail work in a loop, so asynchronous card operations do not imply a uniformly nonblocking update.

The persistent state machine includes delayed discovery (0), slot selection (2), informational card dialogs (3), browsing (4), deletion of a flagged entry (5), five-option selection (6), full view (10), in-card reordering (11), cross-card copy validation/read/write/result handling (12–17), deletion (20), and card switching (21–23). Reordering and deletion include busy polling. Reordering does not check the final poll result in the same way deletion does. Copy progress is timer-driven presentation rather than measured transferred bytes. Numeric status classes and differing recovery branches remain explicit rather than being assigned unsupported error names.

## Input and rendering
Input selector 4 is the selector used by `Menu_GetAllInputs`, not evidence of a physical controller-port restriction. Grid Up/Down input changes the index by one within a parity pair; Left/Right changes it by two and can cross pages. L/R navigate four-entry pages with wrapping. The helper returns 0, 1 or 2 for unchanged, same-page or cross-page movement.

Render gates are exactly state >= 4 for main content, state == 2 for slot selection, states 6/10/11 for the cursor-owned hierarchy, and dlg_active == 1 for warnings/dialogs. State 11 is reordering, not full-screen viewing. Slot highlights distinguish zero from nonzero card status, including negative error statuses; highlighting does not establish card usability.

Dialog configuration and input are separate. Mode 0 hides choices and returns without resetting side pointers/index; mode 1 defaults to Yes; other nonzero modes default to No with locale-dependent ordering. Input writes `dlg_result`; its conditional reconstructed return type does not provide a meaningful C result.

## Lifetimes and review outcome
The four image buffers are allocated by menu-mode entry in `gmmenumode.c`, reused by thumbnails and full view, and are not freed by the album exit helper. Album exit removes retained GObjs and texts and requests the parent-menu transition; that transition also removes the current process owner. Cooldown suppresses both exit processing and frame-count advancement.

All owned canonical/rendered pages, 40 frozen subjects and 36 links were reviewed. Supported baseline knowledge is explicitly retained in the checkpoint ledger. Corrections address grid axes, aggregate input, cooldown, five-option construction, full-view identity, pointer declarations and the slot-animation name collision. Compiled section placement, adjacency, pool inventory and archived object-match claims remain unverified.

Status: researched; no-change lead bypass; independent review and live promotion pending.
