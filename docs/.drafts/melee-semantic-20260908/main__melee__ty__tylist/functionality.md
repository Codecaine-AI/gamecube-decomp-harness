## Trophy collection list

`tylist.c` implements the collected-trophy list's initialization, reusable rows, text and model presentation, navigation, camera rendering, and exit handoff. `tylist.h` exposes only `tyList_803147C4(void)`. Existing inferred function names generally fit canonical behavior; none requires a semantic rename.

### Construction and presentation

The public initializer clears camera/process and auxiliary GObj storage, sets up cameras, validates background archive data, optionally creates scene lighting, and calls `Toy_80307470(0)` to construct the panel label. It clears and constructs the row state only for a nonempty collection, then renews controller status. Missing background data is fatal; a missing light export is tolerated. Camera construction is descriptor-dependent, although creation of the total-text context lies outside that guard.

The row initializer creates `trophy_total + 2` circularly linked entries for totals through ten, or twelve entries for larger collections. It restores ordering and row-offset state, allocates row models and three text objects per entry, constructs the endpoint and cursor, and performs soundless one-frame scroll steps to restore the selected slot. The panel root and endpoint are different objects: `state->gobj` owns the panel, whereas `state->jobj` is created from `ToyFigureListBaseend_Top_joint`.

The number formatter copies two bytes per displayed decimal glyph, suppresses leading zeroes, preserves an internal tens zero, writes a single zero terminator, and returns its address. It does not validate the intended 0–999 decimal domain. Row text updates skip invalid indices and, for small collections, boundary slots. Selection colors are black versus white; argument `0x63` preserves colors while updating content and layout. Row trophy-display refresh maps the list index to a trophy identifier, updates its display, releases the previous marker, and conditionally recreates the MarkN asset.

### Ordering and scrolling

The ordering refresh preserves the selected trophy identifier across a Toy ordering change, remaps its list index, assigns wrapped indices across the linked rows, refreshes their presentation, repositions the endpoint, and updates three ordering indicators. It does not move the panel container.

Scroll setup preserves the active count and direction only when the supplied count equals `-1`; otherwise it replaces both. Every call resets the frame count, divides row spacing by the duration, and takes destination coordinates from neighboring rows. Nonzero duration is a caller precondition, not a checked guard. Position updates clamp according to delta sign; `999.0f` commands an exact snap.

The scroll step runs only while the frame count is positive. Completion snaps rows, wraps logical slots, recycles trophy indices, rotates boundary and selected pointers, consumes a pending movement, and eventually restores the cursor and selection color. Its reverse branch refreshes the loop-carried `entry` pointer rather than explicitly passing `state->x274`; this asymmetry is preserved. Movement sound is independently optional.

The input callback prioritizes active scrolling, cooldown, and pending page movements before new input for collections above ten. Horizontal input cycles three ordering choices. Vertical input changes a clamped visible slot, then supports delayed edge scrolling. Held masks `0x400` and `0x800` request up to nine row movements with boundary-dependent counts. Neutral input resets repeat latches. Empty collections still accept exit paths but cannot confirm a trophy.

### Rendering and lifetime

Startup uses a counter initialized to 26: values above one update indicator animation, value one creates the total text, and the following zero-valued invocation installs normal input. The animation-rate write repeatedly targets `archive->jobjs[0]`, unlike the indexed writes in the ordering refresh.

The list camera callback performs its clear, render dispatch, fog reset, and end-current sequence only after successful activation. Mask `7` dispatches callback passes 0–2 through the GObj's GX-link priorities. The viewport is fixed; the scissor bottom depends on trophy count below ten and is capped otherwise.

Exit mode zero restores default ordering while retaining the selected trophy by identifier, resets navigation context, nulls two references, and removes the principal camera's processes without explicit GObj destruction or SIS reset. Nonzero mode preserves navigation context and requests explicit destruction and SIS cleanup. Only the first auxiliary GObj slot is consumed. Selection publication and selected-trophy handling are skipped for an empty collection. Eventual destruction outside the zero-mode handoff is not established by this unit.

### Review outcome

The checkpoint accounts for all 107 baseline facts and 19 links: 91 facts retained, five superseded with supported corrections, eleven section/layout facts unresolved, and all links retained. Source declarations and literal uses support runtime roles but do not establish compiled section composition, exact sizes, or adjacency. Rendered names were treated as hypotheses rather than evidence.

Status: synthesized; independent review and live promotion pending.
