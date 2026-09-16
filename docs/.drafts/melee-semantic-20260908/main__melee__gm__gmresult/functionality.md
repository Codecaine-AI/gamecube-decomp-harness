# Results-scene semantic review

Reviewed all owned canonical and rendered source, all 83 frozen subjects, 220 facts, and 73 links. Explicit retention groups and exceptions are checkpointed. Existing rendered names generally fit their canonical behavior; no cosmetic naming changes are proposed.

## Functionality

The scene entry callback resets the static Results workspace and borrows the incoming `ResultsMatchInfo.match_end` rather than copying it. It configures pages, bonus descriptors, winner metadata, archive resources, camera, lighting, models, fighter objects, and per-player cameras. No Contest and Retry select two pages and suppress ordinary victory presentation. Other outcomes select three pages; only within that uncanceled branch does match kind 3 start all players on page 2.

Bonus processing scans 256 award entries per slot, counts nonzero entries, and forwards human-earned indices to a shared persistent obtained-bonus bitset. The suppression latch bypasses this processing. Per-player mode-2 descriptor counts are stored in a byte; the source does not establish a bound preventing narrowing of `count * 2 + 2`.

Statistics use callback-backed descriptors. Fixed SIS labels are immediately eligible; dynamic entries follow the ordered check/getter predicate. Mode 2 instead formats paired earned-bonus labels and signed values. Rebuilding removes the previous three-by-ten text set, selects the current page, derives navigation flags, and creates at most ten rows. Its visibility count uses slot 0, whereas row filtering uses the requested slot. The construction boundary excludes the final descriptor entry. The scissor callback also uses player 0's anchors and preserves the unusual masks `0xFFFC` and `0xFFDC`.

The secondary readout dispatches numerically among match kinds 2, 1, 3, and the default score path. Its sibling formatters preserve participation, cancellation, sign, team, stock, final-frame, and score-tie branches. KO-count maintenance removes one text family while retaining and repositioning the secondary family.

Model setup caches fifteen joints for each player and creates mode-specific titles. Newly created title text is not assigned back to `x2C`. Winner-variant selection hides alternate children but does not explicitly unhide the selected child; it can return NULL, although its caller immediately dereferences the result. Placement construction forces selector 1 for No Contest only, not Retry. Winner color setup combines representative slot `x6`, live `Player_GetTeam(x6)`, and the slot type indexed by `x4`.

The exit callback only delegates suppression-latch reset. It does not directly destroy scene resources. Cross-file controller evidence also shows that the forward sound and panel dismissal can be triggered by controller error, not just Start.

## Evidence limits

Compiled section adjacency, ordering, and the claimed 96-byte small-data extent remain unverified. The mode-2 descriptor's `x4` initialization is not established. The public header retains an annotated questionable `u8` cleanup return and several placeholder declarations. The static header differs from the C definitions and is not included by this C file. Rendered collisions and shadowed bindings are renderer limitations, not evidence against otherwise supported names.

Status: researched; no-change lead bypass; independent review and live promotion pending.
