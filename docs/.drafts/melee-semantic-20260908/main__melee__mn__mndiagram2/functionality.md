## VS Records detail screen
`mndiagram2` constructs and operates the second VS Records page. It presents ten rows drawn from 21 fighter statistics or 24 saved-name statistics. Logical selections are resolved before row creation; individual statistic queries consume resolved record identifiers. The header replaces its text in both modes and replaces fighter-icon children only in fighter mode.

Input prioritizes mask `0x20` for back, `0xC0` for neighboring pages, and `0xC00` for mode toggling before directional navigation. Mode toggling rejects an empty name list. Transitions save selections and mode in game-rules fields `x12`, `x13`, and `xD`; construction nevertheless initializes both selected indices to zero. Display and input processes belong to separate GObjs.

## Rendering and ownership
Rows own separate label, value, and unit-glyph text slots; generated fighter icons are children of `icon_parent`. Valid icon-only results produce a fighter icon and return early; unavailable results produce the stored dash. Numeric formatting uses unsigned saturation comparisons. Play Time is formatted as total minutes and two-digit seconds, despite the owned source comment describing hours. Row cleanup is separate from header and user-data destruction.

## Ranking and cross-file use
Diagram3 consumes the classifiers, statistic queries, fighter/name ranking queries, aggregate ranking output, and detail cleanup. Name ranking uses stable descending maximum selection with insertion shifts and returns `0x78` when rank exceeds the name count. Fighter ranking has an important exception: when the current entry is unavailable, its fixed-index sentinel test causes the scan to select the last subsequent valid entry, not necessarily the largest. Aggregate ranking counts selected fighters using raw name indices below `GetNameCount()`, sorts counts by exchanges, and substitutes `SELKIND_COUNT` for a zero-count result. Sparse-name coverage is not established.

`ClearDetailView` operates on Diagram3, clearing its title, five unit-text slots, value text, and generated children under `jobjs[6]`; it does not clear Diagram3's separate ten row labels.

## Lifecycle and evidence limits
The active condition is menu byte `0x1E` and byte `0x10 == 1`. A same-menu non-1 state requests GObj destruction and then falls through to arrow updates. A different menu installs the animation-completion process, hides content, removes header text, and returns. HSD destruction can defer reclamation for its protected current object.

All owned canonical and rendered pages were reviewed, along with all 62 subjects, 121 facts, and 29 links. Existing useful names and supported explanations were retained explicitly. Proposed corrections address stale signatures/types, unsupported default behavior, exceptional ranking order, lifecycle fallthrough, and synthetic animation-table access. No compiled section placement, pool extent, or adjacency is certified.

Status: synthesized; independent review and live promotion pending.
