# Disjoint Librarian Research

### shard-main__melee__mp__mplib-000-recovery5
Reviewed canonical and rendered `src/melee/mp/mplib.c` lines 1–480 only. This range defines collision-related storage declarations, a line-ID assertion macro, and shared parameter records assembled into 20-entry pointer tables; it contains no function bodies. `LINEID_CHECK` reports IDs equal to -1 or at least the current map's line count; it does not explicitly reject other negative IDs. Declared vertex, line, and joint count constants are 2048, 1536, and 256. Each parameter record contains one float and three alternating pairs of four-integer and three-integer arrays. Most visible pointer tables share the same records, while selected tables substitute records at zero-based index 10 or 14. Runtime selection, field meanings, and gameplay mappings are not established by this range.

### shard-main__melee__mp__mplib-001
Reviewed canonical and rendered mplib.c lines 481–960 only.

- Static 20-pointer arrays in this range repeat the same ordered references. The 0x47-entry mpLib_803BF248 initializer associates Gr_Kind constants with pointer arrays; their gameplay meaning is not established here.
- Four accessors return the stored MapCollData pointer and the ground collision vertex, line, and joint arrays directly.
- mpPruneEmptyLines skips Gr_Kind_Pura. Otherwise, lines whose endpoint coordinates are exactly equal are bypassed in neighboring references, marked LINE_FLAG_EMPTY, and have all four adjacency IDs set to -1. Both secondary adjacency replacements use the removed line’s primary adjacency IDs; records are not physically removed or counts reduced.
- The visible prefix of mpLibLoad allocates runtime arrays using global counts, asserts allocation success, calls grDynamicAttr_801CA0B4, and substitutes a static MapCollData object for NULL input. It builds an enabled linked list of runtime joints referencing source joints, scales their bounds by Ground_801C0498’s return value, clears callback fields, then prunes empty lines. Floor and ceiling entries receive source-line pointers and source high flags ORed with LINE_FLAG_ENABLED. The assigned range ends as right-wall initialization begins.

### shard-main__melee__mp__mplib-002
Reviewed canonical and rendered mplib.c lines 961–1440 only.

- The initialization tail enables and binds right-wall, left-wall and dynamic line records, copies original vertex coordinates while storing scaled coordinates, expands bounds, records the collision-data pointer and invokes island/bounding helpers.
- mpLineGetNext and mpLineGetPrev prefer secondary adjacency only when the candidate is enabled, not hidden and the joining endpoints have squared distance below 4; otherwise they return primary adjacency.
- mpRemap2d translates a point using endpoint displacements weighted by its clamped projection along the original segment. Its near-degenerate branch instead adds both destination-endpoint offsets relative to the original first endpoint.
- The four surface-offset routines traverse same-category neighbors to locate an appropriate coordinate interval. Missing or mismatched neighbors permit endpoint clamping within 0.1, otherwise returning -1. On success they return the selected line ID and optionally its low flags, a normalized perpendicular and an axis displacement. Floor/ceiling vertical displacements include respective +0.0001/-0.0001 biases; wall horizontal displacements do not. Traversal details are not fully symmetric: floor forward traversal does not set dir to 1, and left-wall reversal exits do not clamp y like right-wall exits.
- The intersection-function prefix rejects disjoint axis-aligned endpoint bounds and begins a signed cross-product test; its remaining behavior lies outside this shard.

### shard-main__melee__mp__mplib-003
Reviewed canonical and rendered mplib.c lines 1441–1920 only.

- The opening intersection-code fragment rejects collinear, degenerate and near-parallel cases, then computes an intersection parameter and clamps the resulting point to the first segment's endpoints.
- `mpLineIntersectionH` performs direction-sensitive intersection against a horizontal segment. It rejects near-horizontal second segments, tolerates up to 0.1 units of computed horizontal overshoot, and clamps accepted overshoot to an endpoint.
- `mpLib_8004ED5C` retrieves collision-line endpoints and extends endpoints conditionally on previous/next connectivity. The second extension uses the already modified first endpoint when both neighbors exist; it is not simply two independent unit extensions.
- `mpCheckFloor` scans each eligible joint's floor and dynamic ranges, applying callback, joint/line exclusions and enabled/nonempty floor filters. It intersects vertically offset, expanded endpoints with the query segment and selects the smallest squared distance from the query start. Optional outputs receive the intersection, line ID, low flags and normal. Horizontal hits require non-increasing query Y. Bounding-check state established locally is cleared locally.
- The assigned portion of `mpCheckFloorRemap` uses unexpanded endpoints and conditionally calls `mpRemap2d` to replace the query start. It ranks hits by squared distance from the original start, negated when the hit displacement opposes the adjusted query direction. It writes analogous optional outputs and also scans the dynamic range.

### shard-main__melee__mp__mplib-004
Reviewed canonical and rendered mplib.c lines 1921–2400, with a supporting read through line 2422 to finish mpCheckLeftWall; this is not complete TU coverage.

- mpCheckCeiling searches eligible joints' ceiling and dynamic line ranges, filtering for enabled, nonempty ceiling lines. It selects the intersection with smallest squared distance from the query start and conditionally outputs position, line index, map-line low flags, and normal. Near-horizontal lines require ay <= by and use a downward normal; other lines use the general intersection helper and a normalized perpendicular.
- mpCheckCeilingRemap applies the same filtering but conditionally remaps the query start for joints carrying CollJoint_B10, CollJoint_B9, or CollJoint_B8. It ranks hits by signed squared distance from the original start, negating the distance when the hit displacement opposes the remapped query direction; it is therefore not simply a nearest-distance query.
- mpLineIntersectionV performs an orientation-sensitive vertical-segment intersection test. It rejects unsuitable directional crossings and nearly vertical query segments, computes the intersection y, and clamps endpoint overshoot of at most 0.1 after preliminary range tests.
- mpCheckLeftWall searches enabled, nonempty left-wall lines using vertex positions directly. It selects the closest intersection; near-vertical lines require ax <= bx and produce a negative-x normal. The supporting continuation confirms a dynamic-line pass and return behavior.
- The ceiling and left-wall queries establish bounding checks only when none already exist and undo only the checks they established. Optional hit outputs are written only when a better candidate is found.

### shard-main__melee__mp__mplib-005
Reviewed canonical and rendered mplib.c lines 2401–2880, with a supplemental read through the end of mpCheckRightWallRemap. This bounded region implements wall-intersection queries, not collision response. mpCheckLeftWallRemap and mpCheckRightWallRemap optionally remap the query's starting point for each eligible line; mpCheckRightWall uses the original segment. Queries exclude distant joints, honor skip/only joint selectors, and test enabled, nonempty lines with the required wall flag across the dedicated wall range and dynamic range. The ordinary query selects the smallest squared intersection distance from the start. Remapped queries instead minimize a signed squared distance measured from the original start, negating it when its displacement opposes the tested segment direction. Optional outputs receive intersection position, line index, low flags, and normal. Near-vertical lines use a specialized intersection test, direction gates (left: ax <= bx; right: ax >= bx), and fixed horizontal normals. Bounding-check state is acquired and cleared only when not already active.

### shard-main__melee__mp__mplib-006
Reviewed canonical and rendered `src/melee/mp/mplib.c` lines 2881–3360 only.

- The opening fragment completes a preceding query by processing its dynamic-line range, conditionally clearing bounding-check state, and returning its result.
- `mpLib_800511A4_RightWall` and `mpLib_800515A0_LeftWall` scan enabled, nonempty lines of their respective wall classes, including dynamic ranges. Both filter joints by bounding status and skip/only IDs. For each endpoint, they remap its `x10/x14` coordinates, require squared displacement greater than 0.001, and test the endpoint-motion segment against the supplied second segment. They select the smallest signed squared intersection-distance score, optionally write the selected line ID, and return whether a candidate was selected. Bounding-check state is cleared only when established locally.
- `mpLib_8005199C_Floor` returns the first qualifying floor line in traversal order, or -1—not necessarily the nearest floor. It requires the input x to lie between the ordered endpoint x coordinates and the input y to be at or above both endpoints or the interpolated line height. It includes dynamic lines, honors joint filters, leaves the input vector unchanged, and conditionally manages bounding-check state.
- The visible beginning of `mpLib_80051BA8_Floor` rejects zero direction through an assertion, initializes a direction-dependent extremum, applies joint and line exclusions, and filters enabled, nonempty floor lines carrying `LINE_FLAG_LEDGE`. It constructs endpoint bounds and begins strict horizontal/vertical rectangle-overlap tests. Candidate selection and output behavior lie beyond this shard.

### shard-main__melee__mp__mplib-007
Reviewed canonical and rendered mplib.c lines 3361–3840, with boundary context through line 3860; this is not complete TU coverage.

- The opening search tail selects an endpoint according to direction, performs a deferred dynamic-line pass, conditionally releases bounding-check state, and writes a successful optional position with x clamped and z zeroed.
- `mpCheckMultiple` dispatches selected floor, ceiling, left-wall and right-wall checks using bits 1, 2, 4 and 8; bit 0x10 selects the Remap call family. It forwards joint filters and selects the result with the smallest squared XY distance from the starting point. Strict comparisons preserve earlier results on ties. Bounding state is acquired and released only when not already active. Optional outputs are written only on success. `mpCheckAllRemap` and `mpCheckAll` supply masks 0x1F and 0xF.
- Next/previous adjacency helpers accept a candidate only if it is enabled, not hidden, and its connecting endpoints have squared XY separation below 4.0; otherwise they fall back to next_id0/prev_id0. Variants use either the global vertex array or an explicit array.
- Eight directional non-category walkers repeatedly traverse these checked neighbors while the corresponding category flag remains set. They return -1 for a dead end or a return to the starting line, otherwise the first line lacking that flag.
- `mpLineWalkNon` instead follows only next_id0/prev_id0 while a supplied flag mask matches. Its completed body has no explicit cycle check.

### shard-main__melee__mp__mplib-008
Reviewed canonical and rendered src/melee/mp/mplib.c lines 3841–4320, with supporting context for mpLineWalkNon; this is not complete TU coverage.

- Floor/ceiling non-kind wrappers follow next_id0 or prev_id0, skipping lines carrying the requested kind bit and returning the first other line or -1.
- Local adjacency helpers prefer next_id1/prev_id1 only when the target is enabled, not hidden, and the corresponding endpoints have squared XY separation below 4.0; otherwise they return the id0 link.
- The floor and ceiling search routines walk those selected links while candidates carry the required kind bit. They return a candidate equal to the current line's directional id1 link, or -1 on chain termination or a kind mismatch; they are not simply immediate-neighbor queries.
- Two floor endpoint routines walk only id0 links across floor-flagged candidates, then copy the last line's v1 or v0 XY position and set output Z to zero.
- mpFloorGetRight/Left and mpCeilingGetRight/Left traverse through checked adjacency helpers while the masked kind equals the starting kind, then output the last matching line's endpoint with Z zero. Despite their names, their bodies use the starting line's kind rather than a hard-coded floor/ceiling kind. The assigned range also contains the setup and first next-link step of mpLeftWallGetTop.

### shard-main__melee__mp__mplib-009
Reviewed canonical and rendered mplib.c lines 4321–4800 only.

- Wall endpoint helpers traverse checked neighboring lines while their kind matches the initial line, then return the last matching line's endpoint with z = 0. The fully visible left-bottom and right-top helpers traverse backward and select v0; right-bottom traverses forward and selects v1. Direct endpoint getters copy v0/v1 coordinates with z = 0.
- Line utilities expose masked kind and MapLine lo_flags, update lo_flags as `(old & ~0xFF) | flags` with assignment to u16, and calculate a normalized perpendicular `(-dy, dx, 0)`. The availability predicate rejects -1, reports and spins on other out-of-range IDs, and otherwise requires enabled and not hidden.
- Connectivity testing accepts identical IDs, then searches forward and backward through lines of the initial kind. Initial neighbor selection prefers the alternate neighbor only when enabled, not hidden, and corresponding endpoints have squared distance below 4.0; otherwise it uses the fallback neighbor.
- mpLib_800552B0 walks a JObj hierarchy starting at the supplied object's first child, descending unless the tested flag blocks descent, otherwise advancing through siblings and ancestors. It stores the selected object in the collision joint's x20 only if traversal finds one.
- Joint hide/unhide sets or clears hidden bits on the joint and its floor, ceiling, left-wall, right-wall, and dynamic line ranges. Unhide additionally copies each associated vertex's current x/y into x10/x14.
- The range ends in the setup of mpJointUpdateDynamics; its classification/update behavior is not established by this excerpt.

### shard-main__melee__mp__mplib-010
Reviewed canonical and rendered mplib.c lines 4801–5280 only.

- The opening continuation classifies directed collision segments as floor, ceiling, or left/right wall using direction and slope thresholds, then updates kind and conditional platform/enabled flags.
- Joint update wrappers call dynamics and/or mpIsland_8005B334 with the joint's vertex range and an eligibility boolean derived from Enabled, Hidden, and B11 flags.
- mpLib_80055E9C saves previous vertex positions, handles missing/hidden JObjs, transforms source vertex coordinates, updates padded bounds and flags, and synchronizes visibility and island state. Its equal-diagonal matrix branch uses scalar multiplication plus translation; the general branch multiplies vectors by the matrix and can skip further processing after detecting two unchanged vertices when mpLib_804D64CC is nonzero.
- mpJointUpdateBounding expands existing bounds to include each current vertex with a 30-unit margin; it does not reset or shrink bounds. Vertex/line setters write absolute positions or offsets from stored source coordinates.
- mpGetSpeed remaps a supplied point from previous to current line endpoints and returns the resulting XY displacement with zero Z, subject to a helper predicate and debug magnitude checks.
- Seven table accessors select by stage_info.grkind and an input narrowed to u8, returning a scalar, pointer plus auxiliary integer, or paired integers. Gameplay meanings are not established by these accessor bodies.
- sqrtf_store approximates positive square roots using three reciprocal-square-root refinements and a volatile store; nonpositive inputs return unchanged. mpJointFromLine finds the joint whose vertex interval contains the line's first endpoint, otherwise returning -1.
- The final partial function checks helper results, adjusts an input point's Y coordinate, and begins endpoint-distance processing. Its complete traversal/output contract is outside this range.

### shard-main__melee__mp__mplib-011
Reviewed canonical and rendered mplib.c lines 5281–5760 only. The opening traversal tail follows adjacent lines while consuming distance, restricts the reported line to a floor, optionally returns flags/normal, and returns an interpolated position on success or an endpoint on failure. Joint utilities snapshot vertex x/y coordinates, toggle individual line enable flags, and add/remove joints from an enabled linked list while enabling/disabling all five stored line ranges. These operations call mpIsland_8005B334 and set joint->xE. Separate functions toggle CollJoint_B11 and compute the boolean passed to that island routine. Callback accessors manage two callback/data slots; mpLib_8005811C conditionally dispatches slot zero with coll->x50, literal 3, and 0.0F. The beginning of mpLib_800581DC clears conflicting reciprocal adjacency references for two joints, then begins comparing their vertex pairs with a strict per-axis distance threshold of 2.0.

### shard-main__melee__mp__mplib-012
Reviewed canonical and rendered mplib.c lines 5761–6240 only, with preceding connection logic read for context.

- The connection-pair tail links oppositely oriented line endpoints across nearby vertices using reciprocal prev_id1/next_id1 assignments. mpLib_80058560 invokes the pair helper for every unordered pair of enabled, non-hidden joints.
- mpLib_80058614_Floor recomputes collision box[1] only if some joint has xE set. It clears every joint's xE and accumulates endpoint bounds from enabled floor lines in the floor and dynamic ranges of enabled, non-hidden joints. If no qualifying endpoints exist, the initialized extreme bounds remain.
- mpLib_80058820 creates a GObj, registers mpLib_800587FC, and initializes both boxes to ±10000. The callback updates floor bounds before calling grDynamicAttr_801CA224.
- mpBoundingCheck marks disabled/hidden or spatially disjoint joints TooFar; enabled, visible joints with CollJoint_B10 bypass spatial rejection. Touching bounds count as overlapping. Two-point and four-point wrappers construct enclosing axis-aligned bounds. A global boolean records checking, and mpUncheckBounding clears both that boolean and all linked joints' TooFar flags.
- mpLib_SetupDraw configures drawing state and the channel material color. The assigned portion of mpLib_DrawEcbs draws current, previous, and last-position ECB quads and center crosses, with distinct colors and z offsets, then begins an additional conditional line strip.

### shard-main__melee__mp__mplib-013
Reviewed canonical and rendered src/melee/mp/mplib.c lines 6241–6720 only. This range implements collision visualization, not collision resolution. The opening ECB-drawing tail emits translated outline vertices and a position cross. mpLib_DrawSnapping configures camera-relative GX drawing, filters fighter collision data by b0 and x38, draws ECBs, and optionally draws blue right/red left rectangular snap regions using position, ECB horizontal extents, snap offsets, and half the snap height. Its item loop draws eligible ECBs and additionally draws referenced collision data for the explicit It_Kind_Link_HShot branch. mpLib_DrawMatchingLines counts enabled, non-hidden lines satisfying a masked lo_flags equality, then emits one quad per match spanning z = +25 to −25. The reviewed portion of mpLib_80059554 similarly batches floor, ceiling, right-wall, and left-wall ranges with distinct colors; its dynamic section additionally filters by orientation flags, completing the floor pass and beginning the ceiling pass within this shard.

### shard-main__melee__mp__mplib-014
Reviewed canonical and rendered mplib.c lines 6721–7135 only.

- The opening drawing tail emits quads spanning z = ±25 for enabled, non-hidden dynamic right-wall and left-wall lines.
- `mpLib_80059E60` initializes camera-relative drawing state, then selects terrain-palette matching, ledge/platform flag matching, or the default collision drawing helper according to two camera predicates, with the terrain branch taking precedence.
- `mpLib_DrawCrosses` collects successful position lookups into a capacity-bounded buffer and draws three axis-aligned segments extending ±3 units per position. `mpLib_DrawSpecialPoints` invokes it for six differently colored ID-table slices; this establishes visualization groups, not their gameplay roles.
- `mpLib_8005A2DC` calls snapping and collision drawing, conditionally prints five map-collision counters while setting a report latch, and invalidates HSD state.
- Static collision data describes two points at y = -400 and associated line/joint/data initializers; its runtime purpose is not established here.
- `mpLib_DrawZones` draws blast-zone and camera-bound rectangles at z = 0 in complementary depth-test passes, then traverses camera subjects through `prev`, drawing position-plus-extent rectangles for subjects accepted by `Camera_8002928C`. It finishes by invalidating HSD state.

### shard-main__melee__mp__mplib-015
Reviewed canonical and rendered `src/melee/mp/mplib.h` lines 1–206. This header declares the map-collision library interface: collision-data access/loading; line adjacency and geometric queries; floor, ceiling, and wall check families with position, line-ID, flags, and normal outputs; joint filtering and a fighter callback on floor checks; endpoint, vertex, line-property, and joint-update interfaces; callback registration; bounding checks; and drawing entry points. It also declares an external two-element `mpCollisionBox` array. This is declaration-level coverage only, not verification of implementation behavior or complete TU coverage.

### shard-main__melee__mp__mplib-016
The assigned documentation file describes `mplib.h` as the map library and copies that description to `mplib.c`. It documents `mpGetSpeed(int, Vec3*, Vec3*)` with parameters `line_id`, `pos`, and output parameter `speed`; it documents both `mpLineGetNext(int)` and `mpLineGetPrev(int)` as returning a ground index. This shard contains documentation only, not executable implementations.

### shard-main__melee__mp__mplib-017
Reviewed the six assigned subjects, not the complete translation unit. Runtime storage holds loaded collision geometry, joint-list state, aggregate bounds, and diagnostic counters. The floor-bound update conditionally rebuilds one bounding box from eligible endpoints; special-point rendering buffers up to 128 resolved positions and emits three perpendicular line pairs per position. mpBoundingCheck classifies linked joints against a world-space rectangle, respecting enabled/hidden flags and the B10 exemption, then activates the bounding latch. Its caller constructs swept ECB bounds with optional ledge-snap enlargement. Compiled section layouts and several gameplay interpretations remain unverified.

### shard-main__melee__mp__mplib-018
Reviewed the six assigned subjects and their 30 baseline facts. The bounding wrappers reduce two or four points to an AABB and classify collision joints. The ceiling endpoint queries walk same-kind adjacency and return terminal vertices. The all-surface wrappers select ordinary or remapped directional queries, rank contacts by squared distance, and conditionally write outputs. Two bounding-state facts need the enabled/visible prerequisite made explicit; the precise Sacred Fire anchoring claim remains deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-019
Reviewed the six assigned floor, ceiling, and left-wall segment queries and their baseline facts. They traverse eligible collision joints, scan categorized and dynamic line ranges, preserve enclosing bounding-check ownership, and optionally return selected contact geometry and metadata. Ordinary queries minimize squared distance from the supplied start; remapped queries adjust the start per candidate and minimize signed squared displacement from the original start. Floor queries additionally support vertical offsets, line exclusion, and callback filtering. Read callers establish ECB floor/ceiling contact processing and left-wall edge and fighter-to-fighter obstruction tests. This review does not claim complete TU coverage.

### shard-main__melee__mp__mplib-020
Reviewed the six assigned subjects, not the entire translation unit. The segment queries filter collision joints and lines, select contact metadata, and preserve enclosing bounding contexts. Right-wall remapping ranks contacts by signed squared displacement; mpCheckMultiple instead compares the returned directional candidates by ordinary squared XY distance. The bounding accessor reports shared filter state without mutation. Floor endpoint queries follow same-kind adjacency and emit the terminal vertex; their checked adjacency helpers prefer eligible nearby alternate links and otherwise use primary links.

### shard-main__melee__mp__mplib-021
Reviewed the six assigned subjects and their 29 baseline facts, not the entire translation unit. Three parameterless accessors expose shared collision vertex, line, and joint arrays. The loader initializes runtime geometry, and map consumers traverse line adjacency and vertex endpoints. mpGetSpeed derives planar point displacement from saved and current line endpoints; fighter, item, and wall-jump consumers apply or compensate for that displacement. mpJointClearCb1 empties a joint's primary callback/context pair. mpJointFromLine searches joint vertex ranges using a line's first endpoint; its line-ID check is not comprehensive.

### shard-main__melee__mp__mplib-022
Reviewed the six assigned subjects. The callback getters copy the selected joint's callback and payload into unconditional outputs; collision consumers dispatch the first slot for floor contacts and the second for ceiling contacts. Joint hiding sets hidden flags across five owned line ranges. Joint activation appends an otherwise-disabled joint, enables its lines, invokes geometry maintenance, and sets xE. Unlinking maintains active-list endpoints without clearing the removed node's link. B10 configuration only sets a joint flag; its precise downstream meaning remains unestablished.

### shard-main__melee__mp__mplib-023
Reviewed the six assigned subjects. The callback setters replace per-joint callback/context pairs; collision processing retrieves the primary pair for floor-related notifications and the secondary pair for ceiling notifications. Unhiding clears joint and owned-line hidden flags and resets saved vertex coordinates. Dynamic-line maintenance classifies directed segments from endpoint geometry and conditionally changes platform availability. Bounding updates only enlarge existing bounds with 30-unit padding. The left-wall bottom query follows checked same-kind predecessors and returns the retained line's first vertex.

### shard-main__melee__mp__mplib-024-retry154941
Reviewed the six assigned subjects and their 33 baseline facts. The loader constructs runtime collision joints, categorized lines and scaled vertices, publishes the selected descriptor, and initializes dependent bookkeeping. The descriptor accessor returns that shared pointer unchanged. The endpoint and projection queries traverse connected geometry and supply positions, corrections, flags and normals to environmental collision processing; floor projection also supports fighter IK and item placement. One floor-traversal state claim requires correction: forward traversal does not set its direction marker.

### shard-main__melee__mp__mplib-025-retry155554
Reviewed the six assigned collision-query subjects: right-wall chain projection, adjacency-expanded endpoints, mirrored moving-edge wall tests, first-match floor-under-point lookup, and directional rectangular ledge-candidate selection. Current callers establish ECB wall-contact, placement, and ledge-snap uses. Corrections distinguish squared displacement from displacement, finite candidate initialization from infinity, and a relative downward bounding extent from an absolute world height. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-026
The six assigned queries read collision-line topology. Four follow next_id0 or prev_id0 past floor- or ceiling-classified neighbors and return the first differently classified line or -1. Two floor queries prefer enabled, non-hidden id1 neighbors with endpoint squared distance strictly below 4.0, otherwise select id0 neighbors; they continue through floors until the selected ID equals the current id1 or traversal fails. Wall-collision callers derive boundary exclusions from these results for lower floor-associated or upper ceiling-associated ECB contacts. This review covers only the assigned subjects and supporting excerpts.

### shard-main__melee__mp__mplib-027
Reviewed the six assigned subjects and their 34 baseline facts. The ceiling queries search predecessor/successor topology, continuing through fallback ceiling links until a preferred ceiling connection is found; wall collision callers use their results to construct upper-ECB exclusions. The floor queries follow primary floor links and output terminal V1/V0 positions used by ledge-catching and climbing physics. The metadata mutator clears the stored low byte and ORs in its unmasked input; Mute City's script supplies 0 or 0xC. The availability predicate accepts enabled, non-hidden lines, returns false for -1, and traps other invalid indices. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-028
Reviewed the six assigned subjects and their 36 baseline facts. These routines bind collision joints to scene nodes, refresh transformed geometry and connected-surface records, reposition line endpoints relative to stored coordinates, and retrieve stage-specific ground-friction multipliers. Important qualifications are the traversal's lack of a supplied-root boundary, enabled-joint gating of platform updates, and transform optimization paths that still publish island state. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-029
The six assigned accessors retrieve three paired sound/graphic descriptor families from the active stage's surface table using the input's low byte. Sound accessors return four-integer arrays and write sound-control metadata; graphic accessors return effect IDs and write auxiliary metadata. Fighter callers validate grounding and floor availability and handle missing overrides. Family 0 feeds footstep commands, family 1 feeds another action-effect command, and family 2 feeds DownBound impact feedback. The accessors themselves perform no validation, allocation, or table mutation.

### shard-main__melee__mp__mplib-030
Reviewed the six assigned functions, not the complete translation unit. They implement signed traversal over connected collision lines, joint vertex-history snapshots, individual line enable/disable operations, complete collision-joint removal, and conditional restoration of island participation. Line toggles refresh island lists and mark the owning joint; complete removal also unlinks the joint and disables all five owned line categories. B11 clearing does not override disabled or hidden joint state.

### shard-main__melee__mp__mplib-031
Reviewed the six assigned subjects. They deactivate joint island metadata, dispatch ledge-associated callbacks, repair pairwise collision-line adjacency, enumerate eligible joint pairs, recompute dirty floor bounds, and schedule floor-bound and dynamic-attribute maintenance. Pairwise connection uses a strict per-axis distance below 2.0, not exact coordinate equality. The current dynamic-attribute removal code does not recycle every expired record: its non-head removal path unlinks a found record without inserting it into the free list.

### shard-main__melee__mp__mplib-032
Reviewed the six assigned subjects, not the complete TU. The initializer installs recurring bounds and timed-attribute maintenance and seeds two collision boxes. The diagnostic rendering functions submit categorized collision-line quads, historical and alternate ECB geometry, and bounded three-axis position markers. The overlay coordinator draws object and stage geometry, reports retained counters once, and invalidates graphics caches. Platform/ledge drawing uses overlapping single-bit passes followed by both-bit and neither-bit passes, not four disjoint classes.

### shard-main__melee__mp__mplib-033
The assigned functions provide collision-derived GX visualization and a collision-line flag accessor. Drawing includes masked collision-line quads, fighter/item ECBs and snap rectangles, six batches of resolved point crosses, and stage/camera-subject outlines. Shared setup installs TEV and channel state using a supplied color. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__mp__mplib-034
Reviewed the six assigned collision-line queries and their relevant consumers. Kind queries mask runtime classification flags; endpoint queries copy current XY geometry with zero Z; normal queries normalize the perpendicular to the ordered endpoint delta. Next/previous queries prefer an enabled, non-hidden alternate whose joining endpoints have squared XY separation below 4.0, otherwise returning the primary link without equivalent validation. Consumers use these results for wall correction, adjacent-ground fighter nudging, terrain-relative posing, surface-specific dynamics selection, and projectile orientation tracking. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-035
Reviewed six assigned subjects: three directed segment-intersection predicates and three forward collision-topology walkers. The predicates perform orientation and finite-range tests, use local double-precision intermediates, and write intersection coordinates only on success. Floor, ceiling, and wall scans consume these points for nearest-contact selection. The topology walkers prefer enabled, non-hidden secondary links with endpoint squared distance below 4, otherwise use primary links; they skip the specified surface class and normalize dead ends or return-to-origin cycles to -1. Collision callers use their results for floor edges and wall/ceiling corners. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-036
Reviewed the six assigned subjects and all 29 baseline facts. Five topology queries skip connected lines of a specified surface class, using checked preferred adjacency with fallback links, and return -1 for dead ends or return to the origin. Collision callers use their results for floor/ceiling corner recovery, endpoint correction, and distinguishing adjoining geometry from separate wall contacts. mpLineSetPos writes absolute coordinates to both referenced runtime vertices; Mute City's update supplies spline-derived geometry. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-037
Reviewed six assigned functions and their relevant source paths. They test same-kind collision-line connectivity, prune coincident-endpoint lines during loading, remap points using interpolated endpoint displacement, obtain connected right-wall chain endpoints, and reset collision-joint bounding-filter state. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mplib-038-retry154532
The vertex getter copies an indexed collision vertex's current X/Y coordinates to output pointers; the setter immediately replaces those coordinates without validation or collision-maintenance work. Line and stage helpers use the setter, with bounding updates performed separately. The reviewed library code allocates and initializes indexed collision geometry, supports adjacent-line traversal and transformed positions, and stores and dispatches per-joint callback/context pairs. This is a bounded subject review, not complete translation-unit coverage.

### shard-main__melee__mp__mplib-039-recovery7
The assigned subjects belong to joint bounding-box filtering. mpBoundingCheck marks disabled, hidden, or spatially separated joints TooFar, except that enabled, non-hidden joints with CollJoint_B10 bypass spatial rejection; it then sets didCheckBounding. mpBoundingCheck2 computes bounds from two XY points, and mpBoundingCheck3 computes bounds from four XY points before delegating. The inspected mpCheckFloor caller uses this filter to skip joints and clears a bounding check it established itself. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__melee__mp__mplib-040-recovery8
mpBoundingCheck3 computes axis-aligned extrema from four input coordinate pairs and passes those bounds to mpBoundingCheck. That callee updates listed collision joints' TooFar flags according to enabled/hidden status, a bypass flag, and bounding-box separation, then records that bounding was checked. The six assigned parameter identities have no baseline facts; their register-style suffixes are not authenticated mappings to the canonical float parameters.

### shard-main__melee__mp__mplib-041
The bundle contains six parameter subjects and no baseline facts to disposition. The inspected ceiling endpoint functions accept a starting line ID and position-output pointer. They traverse neighboring lines while the line kind remains unchanged, then copy the terminal endpoint's x/y coordinates and set output z to zero. mpCeilingGetRight traverses previous links and selects v0; mpCeilingGetLeft traverses next links and selects v1. No register-to-source-parameter bindings are asserted.

### shard-main__melee__mp__mplib-042
`mpCheckAll` forwards four coordinate scalars, four output pointers, and two joint-selection integers to `mpCheckMultiple`, supplying the constant check mask `0xF` and returning its boolean result. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to retain or change.

### shard-main__melee__mp__mplib-043
The assigned subjects have no baseline facts. Their enclosing functions, `mpCheckAll` and `mpCheckAllRemap`, forward four coordinate values, four output pointers, and two joint-filter arguments to `mpCheckMultiple`, returning its result directly. They supply check masks `0xF` and `0x1F`, respectively. The legacy `#rN` parameter identities cannot be reliably mapped to named C parameters from these bodies alone.

### shard-main__melee__mp__mplib-044
mpCheckAllRemap forwards four output pointers, two joint selectors, and two XY endpoints to mpCheckMultiple with checks=0x1F. This selects all four remapped collision checks. The dispatcher selects the successful result nearest the starting point by squared XY distance, writes non-null output pointers only on success, and returns a boolean. All six assigned subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__mp__mplib-045
The complete bundle contains six parameter subjects, all with empty baseline fact arrays. There are therefore no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic claims or parameter-register mappings are proposed.

### shard-main__melee__mp__mplib-046
The reviewed functions test a segment against enabled, nonempty ceiling lines in eligible collision joints, including dynamic lines. Joint filters exclude a specified joint and optionally restrict checking to one joint. Successful candidates update optional intersection-position, line-index, flags, and normal outputs. mpCheckCeiling selects the smallest squared distance from the segment start. mpCheckCeilingRemap conditionally remaps that start using line vertex data and ranks intersections using signed squared distance from the original start. Both restore bounding-check state when they initiated it. All six assigned subjects have empty baseline fact lists; no fact dispositions or new register-to-parameter mappings are asserted.

### shard-main__melee__mp__mplib-047
The six assigned parameter subjects have no baseline facts. The current mpCheckCeilingRemap body checks enabled, nonempty ceiling lines in eligible joints, including dynamic lines. It conditionally remaps the segment start, selects intersections by a signed squared-distance score, and optionally writes position, line ID, flags, and normal outputs. It returns whether an intersection was selected and releases bounding-check state only when it established that state.

### shard-main__melee__mp__mplib-048
The six assigned parameter subjects contain no baseline facts. The reviewed canonical bodies perform filtered segment-collision queries: mpCheckFloor supports joint and line exclusions, an optional callback, and a vertical offset, selecting the nearest accepted intersection. mpCheckCeilingRemap conditionally remaps the query start and selects intersections using a signed squared-distance score. Both optionally output position, line ID, flags, and normal.

### shard-main__melee__mp__mplib-049
`mpCheckFloor` searches eligible collision joints' floor and dynamic line ranges, applies joint/line exclusions and an optional callback, and tests enabled, nonempty floor lines against the supplied segment with a vertical offset. It selects the nearest accepted intersection to the segment start and optionally writes its position, line ID, flags, and normal. Bounding-check state is restored when established locally. The six assigned parameter subjects have no baseline facts; their register-style identities cannot be mapped reliably to the named C parameters from the reviewed source alone.

### shard-main__melee__mp__mplib-050
The assigned subjects have no baseline facts. Current source shows that mpCheckFloor filters collision joints and floor lines, selects the nearest accepted intersection, and optionally writes position, line index, flags, and normal. mpCheckFloorRemap additionally conditionally remaps the query start and ranks intersections using signed squared distance from the original start. No register-labelled parameter identities were mapped to named source parameters.

### shard-main__melee__mp__mplib-051
`mpCheckFloorRemap` filters candidate floor lines by joint restrictions, callback, skipped line, and enabled/nonempty flags. For selected joint flags it remaps the query start using previous and current line endpoints, tests intersections, and selects the minimum signed squared distance from the original start. Optional outputs receive the intersection, line ID, flags, and normal. All six assigned parameter subjects have empty baseline fact lists; no fact dispositions or new facts are warranted without evidence mapping their register-like identities to canonical parameters.

### shard-main__melee__mp__mplib-052
The complete assigned bundle contains six parameter subjects: mpCheckFloorRemap#r5 through #r9 and mpCheckLeftWall#r10. All six have empty baseline fact arrays and no source hints. Consequently, there are no baseline fact IDs to disposition. No parameter semantics or register-to-source mappings are asserted, and no broader translation-unit coverage is claimed.

### shard-main__melee__mp__mplib-053
mpCheckLeftWall tests a segment against enabled, nonempty left-wall collision lines in eligible joints, including dynamic lines. It selects the intersection nearest the segment's starting point and optionally writes position, line index, flags, and normal. Joint exclusion and restriction filters are applied; bounding-check state is cleared only when this call established it. All six assigned parameter subjects have empty baseline fact lists, so there are no fact dispositions.

### shard-main__melee__mp__mplib-054-retry154857
The reviewed functions test a segment against enabled, nonempty left-wall collision lines, including dynamic lines, with joint exclusion and optional joint restriction. They conditionally output the selected intersection, line index, flags, and normal. mpCheckLeftWall selects the nearest intersection by squared distance from the segment start. mpCheckLeftWallRemap conditionally remaps that start and ranks intersections using signed squared distance from the original start. All six assigned parameter subjects have empty baseline fact lists; no baseline dispositions or new parameter mappings are asserted.

### shard-main__melee__mp__mplib-055
mpCheckLeftWallRemap filters collision joints and enabled, nonempty left-wall lines, conditionally remaps the segment's starting point, and selects an intersection using signed squared distance from the original start. Optional outputs receive the intersection position, line index, low flags, and normal. Joint filters support exclusion and restriction to one joint. Dynamic lines are also examined, and locally established bounding-check state is cleared before return. The six assigned parameter subjects have no baseline facts.

### shard-main__melee__mp__mplib-056
The fully read bundle assigns six parameter subjects, each with an empty baseline facts array and no source hints. There are no baseline fact IDs to assess. No parameter semantics or compiled register mappings are asserted.

### shard-main__melee__mp__mplib-057
The assigned subjects have no baseline facts. Their parent function, `mpCheckMultiple`, dispatches checks selected by a bitmask, with bit 0x10 selecting remapped variants. It selects the successful result nearest the starting point by squared XY distance, preserves earlier results on ties, and writes position, line ID, flags, and normal only through non-null output pointers on success. It restores bounding-check state when it established that state itself. The two inspected wrappers pass masks 0x1F and 0xF.

### shard-main__melee__mp__mplib-058
mpCheckRightWall tests a query segment against enabled, nonempty right-wall collision lines in eligible joints, including dynamic lines. It selects the intersection nearest the query start and optionally writes its position, line index, flags, and normal. Joint inclusion/exclusion and bounding checks constrain the search. All six assigned parameter subjects have empty baseline fact arrays; no fact dispositions or new proposals are warranted.

### shard-main__melee__mp__mplib-059
The reviewed functions test a segment against enabled, nonempty right-wall collision lines, including dynamic lines, with joint exclusion and optional single-joint restriction. Successful candidates update optional position, line-index, flags, and normal outputs. mpCheckRightWall selects the smallest squared distance from the segment start. mpCheckRightWallRemap conditionally remaps that start using stored and current line endpoints and ranks intersections using signed squared distance from the original start. All six assigned subjects have empty baseline fact lists; there are no baseline fact dispositions to emit.

### shard-main__melee__mp__mplib-060
mpCheckRightWallRemap tests a segment against enabled, nonempty right-wall collision lines, including dynamic lines, with joint exclusion/restriction filters. For joints with specified flags, it remaps the segment's starting point using stored and current line endpoints. It selects intersections by minimum signed squared distance from the original starting point and optionally writes the intersection position, line index, flags, and normal. It restores bounding-check state when it initiated the check. All six assigned parameter subjects have empty baseline fact lists.

### shard-main__melee__mp__mplib-061
The complete bundle contains six parameter subjects associated with mpCheckRightWallRemap, mpFloorGetLeft, and mpFloorGetRight. Every subject has an empty baseline facts array; consequently, there are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic or register-layout claims are proposed.

### shard-main__melee__mp__mplib-062
The bundle contains six parameter subjects and no baseline facts. In the inspected source, mpGetSpeed remaps an input XY position between stored and current line endpoints and writes the resulting displacement, with Z zero; its failed validity check returns without writing the output. mpJointFromLine searches joint vertex ranges for the line's first vertex and returns the matching joint index, or -1. No register-to-source-parameter mappings are asserted.

### shard-main__melee__mp__mplib-063
The complete bundle assigns six parameter subjects, all with empty baseline fact arrays. There are consequently no baseline facts to retain, supersede, reject, or mark unresolved. No parameter functionality or register-to-source mapping is asserted.

### shard-main__melee__mp__mplib-064
The assigned subjects have no baseline facts to disposition. Their canonical functions append an indexed collision joint to the enabled-joint list and enable its lines, unlink a supplied joint pointer, set CollJoint_B10 on an indexed joint, and store a callback together with its user-data pointer on an indexed joint. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__mp__mplib-065
The fully read bundle assigns six parameter subjects: mpJointSetCb2#r3, #r4, and #r5; mpJointUnhide#r3; mpJointUpdateBounding#r3; and mpJointUpdateDynamics#r3. Every assigned subject has an empty baseline facts array. There are therefore no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted.

### shard-main__melee__mp__mplib-066
The fully read bundle assigns six parameter subjects, each with an empty baseline facts array. There are no baseline fact IDs to disposition in this shard. No parameter semantics or register mappings are asserted, and no new knowledge is proposed.

### shard-main__melee__mp__mplib-067
The two reviewed functions traverse connected collision lines to find a segment covering the input point's x coordinate, with endpoint tolerance checks. They return the selected line ID or -1. On success, optional outputs receive line flags, an interpolated vertical displacement with a small signed bias, and a normalized perpendicular vector. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__mp__mplib-068
The two assigned parent functions traverse adjacent collision lines according to the query position, reject out-of-range positions beyond endpoint tolerance when traversal cannot continue, and return the selected line ID or -1. The ceiling function optionally writes a vertical offset with a -0.0001 bias, line flags, and a normalized perpendicular. The left-wall function optionally writes a horizontal offset, line flags, and a normalized perpendicular. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__mp__mplib-069
The fully read bundle assigns six parameter subjects and contains no baseline facts for any of them. Consequently, this shard has no fact IDs requiring disposition. No parameter semantics or register-to-source mappings are asserted.

### shard-main__melee__mp__mplib-070
The complete bundle contains six parameter subjects, each with an empty baseline fact list. There are therefore no assigned baseline facts to retain, supersede, reject, or mark unresolved. No new semantic or register-mapping claims are proposed.

### shard-main__melee__mp__mplib-071
The assigned subjects have no baseline facts. Their parent function accepts eight floating-point coordinates, an optional line-ID output pointer, and two joint filters. It checks enabled, nonempty right-wall lines, including dynamic lines, remaps both endpoints, tests endpoint paths for intersection, and selects a line using the smallest signed squared-distance score. It returns whether a candidate was found and restores bounding-check state when it established that state itself. Register-labeled subject identities cannot be reliably mapped to these C parameters from the inspected source alone.

### shard-main__melee__mp__mplib-072
The two parent functions filter collision joints and enabled, nonempty wall lines, examine both endpoints using remapped coordinates and segment-intersection tests, and optionally output the line index with the smallest signed squared-distance score. They include dynamic lines and restore bounding-check state when they initiated it. All six assigned parameter subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__melee__mp__mplib-073
The assigned subjects contain no baseline facts. Their parent function filters collision joints and enabled, nonempty left-wall lines, including dynamic lines. It remaps each endpoint, tests its displacement segment against the supplied B segment, and selects the smallest signed squared intersection distance. It returns whether a candidate was found and optionally writes its line ID. Bounding state established locally is cleared before returning.

### shard-main__melee__mp__mplib-074
The entire assigned bundle was read. All six parameter subjects have empty baseline fact lists, so there are no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled-layout mappings are asserted.

### shard-main__melee__mp__mplib-075
The bounded bundle contains six parameter subjects and no baseline facts. There are therefore no fact records to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted.

### shard-main__melee__mp__mplib-076
The assigned subjects have no baseline facts. Their containing functions implement a bounded search over enabled, nonempty floor lines marked with LINE_FLAG_LEDGE, and forward/backward traversal past floor-flagged lines. The search filters line and joint IDs, selects an endpoint by direction and horizontal extremum, and optionally writes a position with clamped x and zero z. The traversal wrappers take a starting line ID and follow next_id0 or prev_id0 until a non-floor line or -1.

### shard-main__melee__mp__mplib-077
The six assigned parameter subjects correspond to functions taking an `int line_id` as a collision-line traversal starting point. The two simple ceiling wrappers traverse previous or next primary links until the ceiling flag is absent. The other four functions traverse floor- or ceiling-flagged lines, accepting checked secondary links and continuing through fallback links; they return a qualifying line ID or -1. All six subjects have empty baseline fact arrays, so there are no fact IDs to disposition. This review is limited to the assigned subjects.

### shard-main__melee__mp__mplib-078
The assigned subjects have no baseline facts. The three canonical function bodies were reviewed: mpLib_80053DA4_Floor traverses next_id0 while the successor has CollLine_Floor set, then writes the terminal line's v1 coordinates and zero z to its output vector; mpLib_80053ECC_Floor performs the corresponding prev_id0 traversal and writes v0 coordinates. mpLib_80054D68 selects a line by ID and assigns its 16-bit lo_flags field from (old_flags & ~0xFF) | flags; the input is not explicitly masked to eight bits. This review covers only the bounded subjects, not the full translation unit.

### shard-main__melee__mp__mplib-079
The fully read bundle assigns six parameter subjects, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted by this review.

### shard-main__melee__mp__mplib-080
The assigned subjects have no baseline facts. In the current canonical bodies, mpLib_8005667C uses a joint index to select its vertex range and passes that range, the index, and a flag-derived boolean to mpIsland_8005B334. mpLib_80056758 selects a collision line and sets each endpoint's current X/Y coordinates to its stored x0/x4 values plus the corresponding supplied offsets. This review is limited to the assigned subjects.

### shard-main__melee__mp__mplib-081
The assigned parameters belong to four table accessors. Each accessor selects a table using stage_info.grkind and indexes its pointed-to array with the first argument narrowed to u8. mpLib_800569EC returns the selected record's x0. mpLib_80056A1C writes x14[0] through its second argument and returns x4; mpLib_80056A54 writes x14[2] and returns x14[1]. mpLib_80056A8C returns x20 and writes x30[0] through its second argument. All six assigned subjects have empty baseline fact lists, so there are no baseline facts to disposition. This review does not claim complete translation-unit coverage.

### shard-main__melee__mp__mplib-082
The assigned parameters belong to four table accessors. Each selects a record using stage_info.grkind and an unsigned-byte conversion of arg0. mpLib_80056A8C writes x30[0] through arg1 and returns x20; mpLib_80056AC4 writes x30[2] and returns x30[1]; mpLib_80056AFC writes x4C[0] and returns x3C; mpLib_80056B34 writes x4C[2] and returns x4C[1]. All six assigned subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition. This review does not claim complete TU coverage.

### shard-main__melee__mp__mplib-083
The six assigned parameter subjects contain no baseline facts. At source level, mpLib_80056B34 selects a stage-dependent table entry using the low byte of its first argument, writes x4C[2] through its second argument, and returns x4C[1]. mpLib_80056C54 projects an input position onto a line, traverses connected segments according to a signed distance, and optionally returns a resulting line, position, flags, and normal. It returns false on initial validation/projection failure or traversal limits. No register-to-source-parameter mapping or gameplay interpretation is asserted.

### shard-main__melee__mp__mplib-084
The six assigned parameter subjects contain no baseline facts to disposition. Their canonical function bodies implement distance-based traversal across connected collision lines with optional result outputs, copying a joint's vertex XY positions into saved fields, and setting or clearing a line's enabled flag while notifying the island subsystem and marking its joint. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__mp__mplib-085-retry154941
The six assigned parameter subjects have no baseline facts to dispose. Current bodies identify three joint-selection inputs for disabling collision or changing flag B11, two callback-dispatch inputs, and the first joint index of a routine that repairs and reconnects cross-joint line adjacency using nearby vertices. Review is limited to these subjects, not the entire translation unit.

### shard-main__melee__mp__mplib-086-retry154941
The six assigned parameter subjects have no baseline facts. Canonical bodies show a joint-pair connectivity updater, an update callback whose object argument is unused, a cross renderer consuming an index array, length and color, and an ECB renderer consuming collision data. Register-to-source-parameter identity is deferred; no compiled calling-convention or aggregate-layout claims are proposed. This review covers only the bounded shard.

### shard-main__melee__mp__mplib-087
This bounded subjects shard contains six parameter identities, each with an empty baseline facts array. There are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new parameter semantics or compiled-register mappings are asserted.

### shard-main__melee__mp__mplib-088
The assigned subjects concern line-selection inputs and vector-output parameters. The current next/previous implementations select an alternate adjacency when its line is enabled, visible, and its connecting endpoints have squared separation below 4; otherwise they return the primary adjacency. The V0 accessor copies the selected endpoint's current x/y position and writes z = 0. The normal accessor writes and normalizes the perpendicular (−Δy, Δx, 0), returning the output pointer. All six assigned subjects have empty baseline fact lists, so there are no fact IDs to disposition. This review does not claim complete TU coverage.

### shard-main__melee__mp__mplib-089
The complete assigned bundle contains six parameter subjects, each with an empty baseline facts array. There are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted, and no new facts or links are proposed.

### shard-main__melee__mp__mplib-090
The assigned subjects have no baseline facts. Their parent function, mpLineIntersection, performs a direction-dependent 2D segment-intersection test using bounding rejection, signed cross-product tests and a determinant threshold. On success it writes intersection coordinates interpolated along segment A, clamped to its endpoints; rejection paths leave the outputs untouched. No parameter-register mapping is asserted.

### shard-main__melee__mp__mplib-091
mpLineIntersectionH tests intersection against an oriented horizontal segment. It rejects horizontally separated endpoints, incompatible crossing direction, and nearly horizontal query segments. It computes the intersection x coordinate, allows endpoint overshoot up to 0.1 with clamping, and writes x and the horizontal segment's y on success. The inspected mpCheckFloor caller uses it for nearly horizontal collision lines. All six assigned parameter subjects have empty baseline fact arrays; no fact dispositions or new facts are warranted.

### shard-main__melee__mp__mplib-092
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions. The inspected horizontal intersection implementation performs direction-dependent rejection, rejects nearly horizontal second segments, computes the crossing coordinate, and clamps crossings within 0.1 of the horizontal segment endpoints before writing both outputs. No register-labelled parameter mappings are proposed.

### shard-main__melee__mp__mplib-093-retry154941
The assigned subjects have no baseline facts. Their parent function, mpLineIntersectionV, tests a directed segment against a vertical segment: it rejects disjoint Y ranges, applies direction-dependent X checks, rejects nearly vertical query segments, and interpolates the crossing Y. Crossings up to 0.1 outside the vertical segment are clamped to its endpoints; success writes both intersection coordinates. The inspected mpCheckLeftWall caller supplies collision-line endpoints and query endpoints, then uses the intersection to select the nearest hit.

### shard-main__melee__mp__mplib-094-retry155554
The six assigned parameter subjects have no baseline facts. Their canonical functions each accept an integer `line_id`, use it to select the starting collision line, and preserve it as the return-to-start sentinel during traversal. The next variants traverse next links; the previous variants traverse previous links. Traversal skips lines carrying the respective tested collision-kind flag and returns a different line ID, or -1 on a dead end or return to the starting line. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__mp__mplib-095-retry155554
The bundle assigns six parameter subjects associated with mpLinePrevNonLeftWall, mpLinePrevNonRightWall, and mpLineSetPos. All six have empty baseline fact arrays, so there are no baseline facts to retain, supersede, reject, or mark unresolved. No new parameter semantics or compiled-register mappings are proposed.

### shard-main__melee__mp__mplib-096
The complete bundle contains six parameter subjects, all with empty baseline fact arrays. There are therefore no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new parameter semantics or register-to-source mappings are asserted, and no complete translation-unit coverage is claimed.

### shard-main__melee__mp__mplib-097
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions to emit. A canonical call site passes two coordinate-output pointers, two endpoint-coordinate pairs from vertex fields, two current endpoint-coordinate pairs, and the original query coordinates to mpRemap2d before intersection testing. This establishes call-site data flow, but not a mapping from the assigned register-like parameter identities to source arguments.

### shard-main__melee__mp__mplib-098
The six assigned parameter subjects have no baseline facts to disposition. The inspected mpRightWallGetBottom body takes a line ID and output vector, follows checked next-line connections while the line kind remains unchanged, and writes the last matching line's v1 coordinates with z = 0. An inspected mpCheckFloorRemap call passes two output-coordinate pointers, previous and current endpoint coordinates, and the original query coordinates to mpRemap2d. Register-suffixed subject identities are not established by these source observations.

### shard-main__melee__mp__mplib-099
This bounded shard contains six parameter subjects associated with mpRightWallGetTop, mpVtxGetPos, and mpVtxSetPos. All six have empty baseline fact arrays, so there are no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic or register-binding claims are proposed.

### shard-main__melee__mp__mplib-100
`mpVtxSetPos` selects a collision vertex by index and directly assigns its position's x and y components from two float inputs. `mpLineSetPos` calls it for both endpoints with the respective coordinate pairs. Both assigned parameter subjects have empty baseline fact lists; there are no fact IDs to disposition.

### shard-main__melee__mp__mplib-101
The reviewed links connect mplib to runtime stage collision geometry, checked surface adjacency, floor queries, bounding-state access, ECB rendering, and special-point cross rendering. Current code supports these relationships. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__mp__mplib-102
The reviewed links concern connected collision-line traversal, reciprocal connection rebuilding, surface flags and normals, swept floor/wall queries, joint AABB rejection, and special-point drawing. Current callers confirm ECB floor-contact installation and ceiling-associated exclusions in wall processing. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__mp__mplib-103
The reviewed links cover collision-line successor traversal and surface endpoints, per-line disabling, joint callback retrieval, AABB joint filtering, and collision/debug drawing. Current bodies support these mechanisms; section-level attribution and some broader subsystem claims remain deferred. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__mp__mplib-104-retry160717-retry180539
The reviewed code exposes collision-line endpoints and adjacency traversal, expands connected endpoints for floor/ceiling intersection queries, and searches enabled wall surfaces for segment or endpoint-motion contacts. Higher-level collision code consumes topology and ceiling-query results. Initialization registers a dynamic-attribute callback, and debug drawing renders configured snapping rectangles. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__mp__mplib-105
The reviewed links describe collision geometry initialization, floor-contact selection, endpoint-derived orientation, same-kind line traversal, model-driven collision motion, bounds maintenance, island refresh after line enablement, and a callback dispatched during airborne cliff handling. Eleven semantic relationships are supported; the compiled `.sdata2` attribution remains unresolved. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__mp__mplib-106
Reviewed the twelve assigned links against current source. The examined routines traverse collision-line adjacency, select nearest surface-query results, update line participation and joint connections, advance temporary attributes, and draw collision diagnostics. This is bounded link review, not complete TU coverage.

### shard-main__melee__mp__mplib-107
Reviewed the twelve assigned links, not the complete translation unit. Current source supports collision-chain endpoint traversal, saved-to-current geometry remapping, joint AABB broad-phase culling, ECB ceiling contact integration, island participation updates, and blast-zone boundary drawing. Source-level debug-marker and fallback-geometry behavior is visible, but the two compiled-section associations remain unresolved.

### shard-main__melee__mp__mplib-108
The reviewed collision routines initialize bounding state and a maintenance callback, synchronize collision geometry with model visibility and transforms, query ceiling and right-wall contacts, and traverse same-kind collision-line chains. Read callers demonstrate stage initialization, ECB wall-contact processing, and fighter ledge-occupancy checks. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__mp__mplib-109
Reviewed the twelve assigned links, not the entire translation unit. Current code supports collision-joint visibility and activation, transformed vertex history and dynamic surface classification, collision-topology traversal, stage-specific line activation, and camera-invoked collision visualization. Three links remain unresolved because their claimed caller chain or compiled-section attribution is not fully established.

### shard-main__melee__mp__mplib-110
The reviewed links connect runtime stage-collision geometry to directional intersection queries, nearest-contact selection, connected-surface traversal, endpoint motion, ECB wall constraints, collision-joint callbacks, and diagnostic drawing. Current source supports these relationships; this review does not assert complete translation-unit coverage.

### shard-main__melee__mp__mplib-111-retry155554
The reviewed links cover right-wall intersection queries, wall-chain endpoints used by ECB collision resolution, ceiling adjacency traversal, collision-surface displacement, and dirty-triggered floor-bound rebuilding. The rendering routine draws enabled, visible collision segments as color-coded quads. Stage-indexed table access is confirmed, but its claimed impact-effect interpretation remains unverified. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__mp__mplib-112
The reviewed links cover collision-line chain traversal, floor projection and ledge anchoring, wall/ceiling contact resolution, saved-to-current surface displacement, joint bounding-filter reset, and TEV setup for collision drawing. Current source supports these functional relationships. The diagnostic globals are consumed by collision reporting, but their compiled .sbss membership remains unverified. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__mp__mplib-113
Reviewed the 12 assigned links against current canonical source. The supported relationships cover collision-line traversal and endpoint topology, horizontal contact intersection, joint ownership, runtime geometry updates, collision callbacks, and stage-component activation. Eleven links are retained; the specific surface-accessor-to-footstep data flow remains unresolved. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__mp__mplib-114-retry160717-retry180539-retry185219-retry185815
The reviewed collision-library functions traverse connected surface lines, project points onto walls, reject spatially distant collision joints with AABBs, preserve vertex positions for surface-displacement calculations, rebuild inter-joint line connections, and register callbacks consumed by ceiling collision processing. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__mp__mplib-115
Reviewed the twelve assigned links, not the complete translation unit. Current code supports collision-surface traversal, runtime endpoint access and displacement, ledge-candidate selection, and camera/blast-boundary visualization. Great Bay calls the joint-island activation routine after an animation-completion check. Compiled-section associations and the precise graphic-effect interpretation remain deferred.

### shard-main__melee__mp__mplib-116
The reviewed functions manage collision-joint visibility and active membership, read and modify surface properties, traverse connected surfaces, account for endpoint motion, and report nearest movement contacts. Current callers demonstrate endpoint-query participation in ledge grabbing and ceiling-edge handling. Diagnostic drawing and a stage-indexed property accessor are present, but their specific DEVELOP-mode and impact-audio mappings remain deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__mp__mplib-117
Reviewed the twelve assigned links against current canonical definitions and relevant consumers. The functions expose collision vertices, traverse connected collision lines, calculate ceiling and wall offsets, maintain joint callback state, and update geometry used for surface displacement. ECB collision processing consumes endpoint and ceiling-topology queries. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__mp__mplib-118
The reviewed links concern collision-line adjacency, floor projection and filtering, joint geometry refresh, filtered collision visualization, and ECB integration. Current source supports those relationships, with qualifications for predecessor fallback and several incompletely verified implementation mappings. Compiled .sbss membership is not established by source declarations.

### shard-main__melee__mp__mplib-119
Reviewed the eleven assigned links, not the complete translation unit. The inspected code connects collision-line queries to ECB wall contacts and ledge anchoring, traverses line topology, compensates for changing surface geometry, maintains aggregate floor bounds, and draws collision diagnostics. Two links remain unresolved pending additional implementation or consumer evidence.

Status: researched; no-change lead bypass; independent review and live promotion pending.
