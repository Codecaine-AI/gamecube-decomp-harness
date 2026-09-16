# Map collision library — reconciled semantic review

## Scope and evidence

Full owned-file, subject, and relationship coverage is inherited from the hash-bound librarian handoff. The lead independently restored and inspected the canonical evidence for the final proposals and concrete contradictions, including the relevant dynamic-attribute and environmental-collision callers. Shard-local statements that a neighboring function was outside a particular excerpt are not treated as translation-unit-wide coverage gaps.

Supported existing facts, links, and descriptive inferred names are explicitly retained through the handoff. Rendered names remain hypotheses, not recovered original spellings or evidence for their own meanings. Renderer parse diagnostics and partial substitutions do not establish canonical behavior. No compiled section membership, addresses, padding, structure layout, or register bindings are asserted.

## Geometry ownership and loading

The library retains a map descriptor and runtime collision vertex, line, and joint arrays. Loading allocates the runtime arrays, substitutes a static collision graph for null input, initializes enabled joints and their list, binds categorized runtime lines to source MapLine records, and initializes original, current, and saved vertex coordinates. Source records remain relevant after loading: runtime lines reference them, and topology and property operations mutate their fields.

Zero-length-line pruning is logical rather than physical: coincident endpoints cause adjacency bypass, an EMPTY flag, and clearing of the removed line's adjacency IDs without reducing counts. Gr_Kind_Pura explicitly bypasses pruning. Its player-facing stage identity is not inferred from the enum name. The loader's positive-joint-count precondition remains unverified. Its aggregate-bound initializer/comparison pairing leaves ordinary finite vertices unable to replace the initial extrema; this is not described as successful finite-extrema computation.

## Queries and bounding-state ownership

Directional floor, ceiling, and wall queries filter eligible joints and scan the appropriate ordinary range followed by a dynamic range. They test enabled, nonempty lines of the required classification and optionally write selected contact position, line ID, source flags, and normal. Ordinary segment queries rank squared distance from the starting point. Remapped variants conditionally adjust the start and rank a signed squared-displacement metric, not simply nearest Euclidean distance. Floor checks additionally support their callback, offset, and exclusion arguments.

Bounding checks classify the linked joints against axis-aligned rectangles. Disabled or hidden joints are TooFar even when B10 is set. B10 bypasses only geometric rejection within the enabled, non-hidden branch. Two-point and four-point wrappers reduce their inputs to AABBs. Queries reuse an enclosing bounding scope and clear the shared latch and TooFar flags only when they established that scope themselves.

The two endpoint-motion wall queries initialize their best metric to F32_MAX and test each endpoint only when squared remapped-to-current displacement exceeds 0.001F. Their strict signed comparisons preserve an existing candidate on ties. The floor-under-point lookup is first-match, not nearest-floor selection; its temporary broad-phase segment ends at point.y - 30000.0F, not absolute y = -30000.

Surface projection routines traverse adjacent geometry and permit endpoint clamping within their tolerance. Their direction handling is not interchangeable: the floor routine sets its marker after backward traversal but not after forward traversal. A forward walk may reverse backward; a subsequent attempted forward reversal clamps to the current v1 endpoint.

## Topology and validation

Checked adjacency prefers id1 only when the candidate is enabled, non-hidden, and its joining endpoints have squared XY separation strictly below 4.0. Otherwise it returns id0 without equivalent validation. The floor/ceiling search wrappers terminate on equality between the selected ID and the current directional id1 field; equality is not proof that preferred-link validation succeeded if id0 and id1 can alias.

Non-category walkers skip only their named classification. In particular, mpLineNextNonLeftWall need not return a non-wall line. Environmental-collision callers separately test ceiling classification. Return-to-origin guards do not establish protection against every possible cycle; primary-only walkers and other chain routines require topology invariants for stronger termination claims.

LINEID_CHECK rejects -1 and IDs at or above the line count but does not reject other negative IDs. mpJointFromLine returns -1 for its explicit sentinel or a failed ownership search, not uniformly for every invalid input. The separate availability predicate has different invalid-input behavior and tests collision flags; it must not be generalized into a visual-rendering-state guarantee.

## Geometry maintenance and lifetimes

Direct setters change current vertex coordinates without automatically performing all dependent maintenance. Joint bounding updates enlarge existing bounds with 30-unit padding rather than resetting or shrinking them. Hide/unhide changes collision hidden flags across owned ranges; unhide also resets saved vertex coordinates. Joint removal disables its ranges and unlinks participation without freeing the retained geometry. B11 set/clear operations forward activity to the island subsystem; clearing B11 does not override disabled or hidden state.

Dynamic-line classification follows directed endpoint geometry. Orientation-dependent platform enablement additionally requires an enabled joint and source flag 0x400. The transform updater increments the collision counter and snapshots coordinates before its JObj checks. Its shortcut tests equal diagonal matrix entries only, not a general uniform-transform invariant. B9 is set without being cleared in this body. The unchanged-vertex escape skips remaining transforms, bounds, and dynamics work but still reaches conditional unhide and island publication.

Pairwise joint connection repair clears conflicting reciprocal references and links opposite endpoints when both absolute coordinate differences are strictly below 2.0. It is tolerance-based, not exact endpoint coincidence. The source pair casts do not independently prove compiled layout compatibility.

The distance-traversal routine has kind-dependent accumulator resets and counts whole endpoint distances before deciding whether to stop inside a segment. Its apparent first-use initialization and scratch-pointer anomalies remain deferred for compiled and precondition evidence; no simple total-travel-limit contract is substituted.

## Callbacks, periodic maintenance, and properties

Two callback/context slots are retained per collision joint. The explicit dispatcher returns normally with a void signature, suppresses dispatch for -1 or missing ownership/callback, and forwards the context, joint index, CollData pointer, coll->x50, literal 3, and 0.0F. No gameplay event identity is assigned to the numeric callback argument solely from this body.

The recurring callback first performs dirty-gated floor-bound maintenance, then updates dynamic attributes. Floor maintenance uses xE as a rebuild trigger, clears the markers during rebuilding, and accumulates eligible floor endpoints; no qualifying endpoints leave its initialized extrema. Dynamic-attribute lifetime updates cache next before removal. Current C recycles an expired head record, but a found non-head record is unlinked without free-list insertion. This cross-file distinction is preserved rather than replaced with unconditional recycling.

Stage-indexed accessors narrow their selector to u8 and return table fields or companion outputs. Caller-backed interpretations are retained where established; numeric fields alone do not establish every sound, effect, or gameplay meaning. The property mutator assigns u16 from (old & ~0xFF) | flags without masking the incoming flags, so arbitrary input can set high-byte bits. The inspected DownBound sound selector repeats its x1F4 comparison and does not establish four distinct reachable magnitude bands.

## Diagnostics and naming

GX routines visualize current and historical ECB geometry, fighter snap rectangles, categorized or masked collision-line quads, six batches of resolved point crosses, and stage/camera-subject outlines. The item loop draws ECBs; fighter snap-rectangle behavior is not extended to items. The single-bit ledge/platform drawing passes overlap for lines carrying both bits. The report latch is set before OSReport. Static camera bounds are not equated with the actual visible camera rectangle, and the renderer is not used as evidence for KO mechanics or mode activation.

Descriptive names for projection, offsets, connection rebuilding, floor-bound updates, transform maintenance, and drawing remain useful hypotheses subject to these qualifications. No equivalent-wording renames are proposed. The six upstream parameter facts are omitted: their source-level roles are visible, but their association with legacy #rN subject identities is not authenticated.

## Reconciliation policy

The final proposal contains ten supported factual corrections. All unchanged research dispositions are inherited verbatim. Upstream unresolved mixed claims remain deferred for their individual missing caller, asset, activation, invariant, provenance, or compiled-evidence reasons; confirming a local mechanism does not validate every appended gameplay or layout assertion. The accepted deferrals are not converted into claims that the source contradicts every deferred interpretation.


Status: synthesized; independent review and live promotion pending.
