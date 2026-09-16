# Disjoint Librarian Research

### shard-main__melee__gr__ground-000
Reviewed canonical and rendered `src/melee/gr/ground.c` lines 1–480 only. This section defines shared stage state, a default StageData record with empty callbacks, and a stage-data pointer table containing null and repeated entries. `Ground_801BFFB0` resets selected stage fields, callback pointers and object arrays, and installs default camera and blast-zone bounds. Allocation helpers allocate and zero a 64-byte buffer, allocate Ground user data with failure reporting, and forward freeing to HSD_Free. Parameter accessors read/write `param->y`, read `param->x4` with a 128 fallback, and copy or expose pointers to nine GXColor fields. `Ground_801C06B8` conditionally passes stage data to a DVD helper and dispatches two explicit stage-kind cases. `Ground_801C0754` resets stage state, selects the stage record, passes its data to a data-file helper, installs callbacks, and invokes additional setup helpers. The assigned range ends partway through `Ground_801C0800`, where parameter fields are forwarded to other helpers.

### shard-main__melee__gr__ground-001
Reviewed canonical and rendered ground.c lines 481–960 only.

- The initialization tail registers item data, replaces article state scripts, conditionally loads particle resources, loads collision data, and invokes additional setup functions and the stage's on_init callback.
- Ground_801C0A70 chooses a position using a randomized, stage-whitelisted player-relative branch, otherwise falling back to Stage_80224FDC. The player-relative branch places Y five units below the top blast-zone offset and adds an integer X offset from -50 through 49.
- Ground_801C0C2C services two requested position searches using strict rectangular bounds and optional callbacks. It records the first accepted index or -1 and clears each serviced request. Separately, a game predicate enables descriptor submission after frame 1200 and more than 30 frames since the previous attempt; the timestamp advances even if position selection fails.
- Lifecycle wrappers dispatch on_load, on_start, and on_demo_init. Startup drains and frees a head-inserted callback list, then installs Ground_801C0C2C as a process. Other helpers provide stage-kind-specific dispatch, unit-scale reset, and child-before-sibling joint selection by a decrementing traversal index rather than structural depth.
- Ground_GetStageGObj constructs a new stage object, initializes selected Ground fields, loads archive joints or builds a fallback joint arrangement, applies a stage-parameter uniform scale, conditionally creates a camera object, and installs two processes. The final assigned lines begin another constructor but do not include its full body.

### shard-main__melee__gr__ground-002
Reviewed canonical and rendered ground.c lines 961–1440, with continuation through the BGM selector's return for context; this is not complete TU coverage.

- The opening construction tail initializes ground callbacks and flags, attaches a joint object, and registers two processes. One animates joints, calls the material updater, increments mpColl_804D64AC, and invokes x8_callback; the other invokes xC_callback.
- Stage helpers OR flags, return masked flags or stored fields, and control the bit gating fog submission. Fog initialization selects the first flagged callback entry's descriptor, loads and registers a fog object, scales its distances by param->y (default 1), and uses its RGB as the camera background. Separate helpers apply the background and safely read/write the fog color.
- Light override lookup matches descriptor pointers. If any listed light has an active override, Ground_801C20E0 filters eligible entries in place and updates descriptor masks 4, 8, and 0x400 from override fields. Without such a match it leaves the list unchanged. Another helper scales available light positions and interests; spline lookup asserts an archive and checks the data pointer and upper index bound.
- Ground_801C24F8 finds a matching stage parameter record, combines selection flags with random and predicate-gated rules, selects primary or alternate BGM fields with undefined-alternate fallback, and updates a stage-state bit according to the selection mode. Its continuation writes the selected result through arg2, handles the -2 sentinel via an audio helper, and returns whether an available alternate was selected.

### shard-main__melee__gr__ground-003
Reviewed canonical and rendered ground.c lines 1441–1920 only.

- The BGM-selection tail chooses table entries with undefined-entry fallbacks, updates a stage flag, asserts that a selection exists, and handles the -2 sentinel through a player-character-dependent audio call. Ground_801C28AC forwards to the selector.
- Stage-parameter helpers locate a matching stkind, produce 35 pairwise signed-16-bit products or a product of two percentage-scaled values, and report then spin indefinitely when required parameters are absent.
- Accessors expose stage storage, map objects, and indexed JObjs. A pointer registry suppresses duplicate registrations, fills the first empty slot, and asserts on exhaustion; its membership helper checks four slots.
- Ground_801C2D24 resolves indexed positions using JObjs and recursive fallbacks. Indices 8 and 9 average pairs; 0x7F tries 0x94 with a +50 Y offset before falling back to index 0. The averaging branches do not check recursive return values.
- Joint-processing helpers traverse both stage-wide records filtered by map ID and archive-local records. Attachment invokes three mpLib operations per record and then Ground_801C3214. Updating is gated by a per-map byte and stamps collision-joint records to avoid reprocessing stamped archive entries.
- Callback traversal visits both record sources without deduplication. State-transition wrappers change the per-map byte before traversal, invoking mpJointListAdd on 1→0 and mpLib_80057BC0 on 0→1. Another wrapper applies mpLib_80057424.
- Two lookup helpers map record z→x and x→z, returning -1 if absent. They keep the last matching result, with archive matches overriding stage-wide matches.
- The range also contains an unexplained UNUSED u32 table and only the declarations/initialization at the beginning of Ground_801C34AC.

### shard-main__melee__gr__ground-004
Reviewed canonical and rendered ground.c lines 1921–2400, with boundary-function context only; this is not complete TU coverage.

- Ground_801C34AC matches an archive entry by joint pointer, traverses the runtime joint hierarchy by indices from signed-short pairs, and stores resolved pointers in stage_info.x280. Traversal skips instance children and restarts from the root when target indices decrease. Ground_801C36F4 requires a matching archive entry, then clears cached pointers whose topmost ancestor equals the supplied root.
- Ground_801C3880 through Ground_801C39B0 directly assign camera bounds, offsets, orientation/depth/zoom parameters, pause/fixed-camera parameters, tracking parameters, and blast-zone edges.
- Ground_801C39C0 derives ordered camera bounds from two returned vectors relative to a third vector, or selects hard-coded grkind-dependent defaults when a lookup fails. Ground_801C3BB4 similarly derives blast-zone bounds from two returned vectors minus the current camera offsets, with its own fallback table.
- Ground_801C3D44 and Ground_801C3DB4 register pointers and half-scaled float arguments, set participation bits, update flag masks according to whether stored values equal -1, and return those stored values. Only the former copies its valid stored value into x6D0.
- Ground_801C3E18 searches node, child, then sibling recursively for the first animation object; Ground_801C3F20 returns that object's current frame or zero. Ground_801C3FA4 performs indexed hierarchy traversal starting at the GObj root's first child, returning NULL when traversal is exhausted.

### shard-main__melee__gr__ground-005
Reviewed canonical and rendered ground.c lines 2401–2880, with minimal boundary reads; this is not complete TU coverage.

- Joint traversal advances child-first, skips instance children, then follows siblings or ascends to an ancestor's sibling. The indexed traversal starts at the root's first child.
- Item-related routines submit requests for populated joint slots, count successful It_Kind_Mato requests, initialize two counters, and set flag 0x20 when the mutable counter decrements to zero. Another routine submits descriptors containing x14 = 0x14 for slots 252–259.
- Small helpers maintain current/previous scalar values, return the current value and its difference, forward an argument to grZebes_801DA3F4, and look up an archive entry's boolean flag by pointer identity, asserting on an unmatched non-null pointer when the table is nonempty.
- Lighting initialization selects the first callback-marked archive light list or a built-in two-entry fallback, creates and attaches lights, scales position/interest vectors, initializes animation, applies AOBJ_LOOP according to archive metadata, and installs rendering and update callbacks. The update routine animates each list member but reads and rescales world objects through the original head pointer, not the current member.
- Accessors find the first ground-classified object in an entity list, select a configured or fallback light list, and return yakumono_param.
- Ground-object teardown invokes its optional callback, clears matching registrations, processes an associated object, performs guarded map cleanup and archive-dependent joint cleanup calls, and finally passes the object to HSD_GObjPLink_80390228.
- The spline helper obtains a point and a secondary vector, normalizes that vector, constructs a cross-product basis with an alternate reference axis near vertical alignment, and writes three trigonometric orientation components with a separate near-singular branch.

### shard-main__melee__gr__ground-006
Reviewed canonical and rendered ground.c lines 2881–3359 only.

- Stores a shared object pointer, vector and scalar; exposes the vector/scalar and dispatches two operations to Kongo or OldKongo implementations using the stored object. Both dispatch wrappers return true even when neither stage matches.
- Captures six joint-derived points and enables camera-dependent fog updates. The updater selects a point pair by eye-vector X sign, blends with another pair when Z is negative, then uses distances from the camera eye as fog start/end. Start is at least 5 and end at least 10; when start exceeds end, end becomes start + 1.
- Wraps audio calls and manages eight per-Ground handles. Invalid indices and null objects are ignored; 540000 leaves a slot unchanged, 540001 clears it, and other values replace its handle. Includes handle queries, single/all-slot clearing and two scaled parameter updates.
- Provides nullable on-touch-line callback dispatch, direct stage-field accessors, player-zero entity access, and fixed-versus-standard camera selection.
- Coordinates display/Toy calls and cached selection state, forwards a computed position and identifier into an item-producing call, and samples archive values. The archive sampler collects at most 32 matching entries with values in [220,252), preserves duplicates, returns -1 if none exist, and randomly indexes the collected entries.
- Exposes a stage flags field, wraps additional Toy calls, and converts an orthonormal basis to Euler angles before zeroing each component whose absolute-value comparison against 30000 fails.

### shard-main__melee__gr__ground-007
### Assigned header: `src/melee/gr/ground.h`, lines 1–162
This guarded header declares the Ground module's external interface and `extern StageInfo stage_info`. Its signatures connect stage identifiers and callbacks with Ground/HSD objects, colors, joints, splines, lights, camera objects, dynamics descriptors, fighters, items, and vector/scalar parameters. It contains declarations only: no function bodies, state transitions, allocation rules, or concrete structure layouts. Consequently, this review establishes the interface surface, not the gameplay meanings suggested by rendered names. Both canonical and rendered views of the entire assigned header were read; no complete-TU coverage is claimed.

### shard-main__melee__gr__ground-008
### Assigned documentation: `ground.dox`, lines 1–21
The file documents three ground interfaces. `Ground_GetYakumonoParam` directly returns `stage_info.yakumono_param`; the documentation leaves its meaning as a TODO. `Ground_801C4B50` has stale documented parameter types: its implementation takes an `HSD_Spline*` and a `Vec3*`, evaluates a spline point through a helper, and computes three angular components into `result` using normalized cross products and trigonometric branches. `Ground_EnableMatchCamera` dispatches to `Camera_SetModeToFixed` or `Camera_SetModeToStandard` according to `stage_info.param->x4C_fixed_cam`. The documentation additionally describes an unpause use case, which was not independently verified here. Coverage is limited to the assigned documentation and supporting implementation excerpts, not the complete TU.

### shard-main__melee__gr__ground-009
The reviewed declarations and consumers establish a shared StageInfo context, a Ground-kind-indexed descriptor registry, and allocation/reset of a 64-byte buffer. Stage setup resets shared state, selects resources and callbacks, and consumes parameters before invoking the descriptor's initialization hook. Ground objects consume this configuration and are registered for indexed retrieval. Diagnostic strings and numeric literals are visible in C, but their exact compiled-section placement and section-wide composition are not established by these reads.

### shard-main__melee__gr__ground-010-recovery5
Reviewed the six assigned subjects. They provide an empty demo callback, shared stage-state reset, device-registration reset and 64-byte buffer initialization, a null-tolerant stage scale getter, a stage shadow-intensity getter, and a shared presentation-color setter. Caller reads confirm startup sequencing, spatial scaling, shadow-intensity consumption, and magnifier color propagation. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__ground-011
The six assigned functions synchronously copy caller-supplied GXColor values into the active GroundParam fields xC0, xD0, xD8, xC4, xCC and xD4. They perform no validation, interpolation or scheduling. Paired getters expose the stored fields by address. The magnifier initializer imports xC0, xD0 and xD8 into its second, third and fourth color slots. Two grlast preset routines update all nine related color entries; sequence cases 10 and 14 invoke these presets alongside separately managed camera-background transitions. This review covers only the assigned subjects and necessary supporting code.

### shard-main__melee__gr__ground-012
Reviewed the six assigned color-interface subjects. Ground_801C05D4 and Ground_801C05EC synchronously copy colors into the active GroundParam's xBC and xC8 fields. The four assigned getters return mutable aliases to xB8, xC0, xD0, and xD8. The magnifying interface copies these four corner colors during initialization and obtains position-dependent samples through a nine-entry accessor table, blending RGBA channels into the erase color before rendering a fighter. This is bounded subject coverage, not complete translation-unit coverage.

### shard-main__melee__gr__ground-013
The five assigned color accessors return mutable aliases to members of the GroundParam referenced by stage_info.param, without copying or modifying those members. Ground_801C06B8 guards the selected stage descriptor, optionally submits its data1 filename to the DVD preload cache, and dispatches two supplemental stage-module calls. The scene-resource caller supplies its ground kind through the StKind-to-GrKind mapping. This review covers only the assigned subjects.

### shard-main__melee__gr__ground-014
Reviewed the six assigned Ground functions and their baseline facts, not the complete translation unit. They implement selected-stage resource setup, runtime subsystem initialization, randomized drop-position selection, pending proximity searches and rule-gated periodic item requests, stage startup, and deferred callback registration/draining. The drop-position allowlist contains 27 active entries, not 29. Deferred callback producer and consumer use inconsistent local argument types, so their compiled-layout equivalence remains unverified.

### shard-main__melee__gr__ground-015
Reviewed the six assigned Ground subjects. They provide an empty presentation hook, stage-specific display dispatch during HUD disable, unit-scale normalization used by Smash Taunt setup, preorder joint-descriptor selection, archive-backed JObj instantiation, and direct-joint Ground object construction with scheduled callbacks. The direct-joint factory's helper hangs on JObj allocation failure, making its subsequent NULL cleanup branch unreachable for that failure.

### shard-main__melee__gr__ground-016
The assigned Ground routines implement two scheduled object processes and four shared-stage-flag helpers. The priority-1 process animates the JObj hierarchy, updates material-overlay commands, increments mpColl_804D64AC, and conditionally dispatches x8_callback. The priority-4 process only conditionally forwards its GObj to xC_callback. The flag setter ORs a caller mask into stage_info.flags; the queries return raw masks 0x330, 0x20, and 0x100 without mutation. Read callers demonstrate a status-1 producer of 0x10, a match-outcome branch consuming 0x330, and a rules predicate consuming 0x20. Player-facing interpretations beyond those branches remain deferred.

### shard-main__melee__gr__ground-017
Reviewed the six assigned Ground subjects. They expose a raw stage-flag mask, a reward-table key, two progress counters, and a shared fog-enable setter/getter. The fog callback checks the camera predicate and enable flag before forwarding a non-null attached payload to HSD_FogSet. Current results and interface consumers corroborate reward selection and target-progress handling. Named-stage mappings remain deferred where the read code establishes mechanics but not the asserted stage identity.

### shard-main__melee__gr__ground-018
Reviewed the six assigned subjects, not the entire translation unit. These routines construct and expose stage fog, copy fog colors through guarded setters/getters, supply the stage camera-tilt parameter, and conditionally filter and modify a light list using archive overrides. Fog initialization scales depth endpoints and initializes the camera background; absent descriptors produce a black background without clearing the stored handle. Light filtering is enabled only after finding at least one matching override with a true attribute.

### shard-main__melee__gr__ground-019
Reviewed the six assigned Ground helpers and relevant consumers. They scale linked light positions and interests, retrieve archive spline pointers, resolve stage BGM through a mask-controlled policy and public wrapper, and produce/expose 35 effective item counts used by weighted item selection. This is bounded subject coverage, not complete translation-unit coverage.

### shard-main__melee__gr__ground-020
Reviewed the six assigned Ground helpers and relevant consumers. They provide a stage-keyed item-countdown multiplier, unchecked map-object publication, duplicate-safe auxiliary-camera registration and membership testing, and indexed JObj retrieval/publication. Display code uses camera membership to suppress components without an auxiliary render object. Stage modules consume and replace shared JObj references for positioning. Camera registration's null-input behavior depends on whether an empty slot exists.

### shard-main__melee__gr__ground-021
Reviewed the six assigned functions, not the entire translation unit. Ground_801C2D24 resolves registered stage positions and reserved-ID fallbacks. Ground_801C2ED0 initializes map-selected collision joints from archive and stage tables. Ground_801C2FE0 refreshes enabled map collision, stamping joints to suppress duplicate archive-side updates. Ground_801C3128 dispatches a callback over both joint sources without deduplication. Ground_801C3214 and Ground_801C3260 implement opposing guarded activation/deactivation transitions; their boolean results report processed joints rather than whether the state byte changed.

### shard-main__melee__gr__ground-022
Reviewed the six assigned subjects. They snapshot map-associated collision vertices, translate between collision and model joint indices using stage and archive tables, populate and invalidate shared JObj references, and set the upper camera boundary. Mapping lookups retain the last matching archive record over stage-table matches. Reference registration traverses runtime hierarchies using authored index pairs; destruction clears registrations belonging to the removed root. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__ground-023-recovery5-recovery8
The six assigned functions directly replace stage-camera configuration: bottom/left/right bounds, paired XY offsets, four orientation parameters, and depth/zoom fields. They contain no validation or interpolation. Stage accessors add offsets to bounds and expose stored parameters. Common Ground initialization supplies orientation and depth settings; stage-specific callers modify bounds and interpolate offsets. The camera consumer uses the field named cam_zoom_rate as a minimum framing distance, not a temporal zoom speed.

### shard-main__melee__gr__ground-024
The six assigned functions directly overwrite retained stage configuration: pause-camera depths and directional angles, fixed-camera pose/FOV, fixed zoom, tracking ratio, tracking smoothness, and the top blast-zone edge. Common Ground initialization supplies the camera values from stage parameters. Stage accessors return scalars, convert stored angles to radians, and add the vertical camera offset to the top blast boundary. Gameplay-camera updates use tracking smoothness in interest and position interpolation; mode selection is separate from configuration storage. This review covers only the assigned subjects.

### shard-main__melee__gr__ground-025
Reviewed the six assigned functions. Three independently replace stored bottom, left, and right blast-zone coordinates. Camera-range initialization sorts two marker positions relative to a third origin marker; blast-range initialization sorts two markers and subtracts existing camera offsets. Both initializers provide stage-kind-specific fallback constants. Ground_801C3D44 installs channel configuration, halves two float inputs, and publishes and returns an already stored result without evaluating the callback.

### shard-main__melee__gr__ground-026
Reviewed the six assigned subjects. They configure and poll the second shared route-trigger channel, find the first joint animation object and read its current frame, perform indexed or single-step flag-sensitive joint traversal, and spawn Mato items from 21 reserved placement slots while initializing target counters. Route callers consume trigger results in controller transitions; stage initializers consume indexed joints. Specific named Adventure encounters and the moving-track-car mapping remain deferred.

### shard-main__melee__gr__ground-027
Reviewed the six assigned Ground helpers and relevant callers/delegates. They request Flippers from eight stage joints, decrement target accounting and latch a zero-count flag, maintain and expose a two-sample vertical level, forward positional Brinstar effect requests, and query archive flags used to enable light-animation looping. The contact callback compensates the previous fighter position for surface displacement; the effect delegate limits active instances to ten. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__ground-028
This shard covers stage-light initialization, animation and render callbacks, plus runtime-light and descriptor-list accessors. Initialization selects archived or fallback descriptors, constructs a light-bearing GObj, scales available endpoints, configures animation and installs callbacks. The recurring animator advances every light but conditionally rescales only the original list head's changed endpoints. Rendering replaces current lights and initializes them against the current camera. Stage callers use the runtime accessor to alter visibility and animation; the descriptor accessor applies in-place archive overrides before fighter-common light construction.

### shard-main__melee__gr__ground-029-schema6-recovery8
Reviewed the six assigned Ground functions and their relevant consumers. They implement map-object teardown, spline position/orientation evaluation, shared barrel-object transform publication and retrieval, and two Kongo-family request dispatchers. Canonical source requires corrections to the setter's pointer type and teardown callback guard. The capture-cleanup handlers test a raw byte in the retained object; interpreting that condition as fighter invalidation remains unresolved.

### shard-main__melee__gr__ground-030
Reviewed the six assigned subjects. The fog initializer enables updates and snapshots six joint-derived reference vectors; the updater selects or directionally weights endpoint pairs, computes eye-to-endpoint distances, and bounds the fog interval. The audio helpers provide fixed-volume/pan playback, optional track control, and eight managed voice slots with replacement, stop, and activity-query behavior. Stage callers coordinate these requests with animation, object removal, and presentation timing. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__ground-031
Reviewed the six assigned subjects and their 33 baseline facts. Ground's indexed audio helpers key off and invalidate one or all eight tracked handles, or update a selected handle's volume or pan through scaled audio-library parameters. Bulk cleanup is called during Ground-object destruction. The line-touch wrapper synchronously delegates to an optional stage callback; fighter collision and bury code interpret its returned descriptor. The status setter unconditionally publishes an integer consumed by a reset/callback/poll handshake in stage logic. This is bounded subject coverage, not complete translation-unit coverage.

### shard-main__melee__gr__ground-032
The six assigned functions expose small shared-state interfaces: reset/read of an event-status integer, read of a player-position selector, write/read of an Onett car-phase integer, and read of an untransformed floating-point field. Current callers confirm reset–launch–callback–poll synchronization, selector-based spawn-platform positioning, and zero/nonzero car-state consumption. This review covers only the assigned subjects.

### shard-main__melee__gr__ground-033-schema6-recovery7
Reviewed the six assigned Ground functions and relevant consumers. They initialize and expose a cached trophy identifier, create a trophy-bearing item at a stage marker, select an archive-derived trophy-placement marker, initialize trophy availability, and commit working trophy state. The archive selector chooses a position identifier, not a minor-enemy kind: generator setup stores its result in the marker field subsequently passed to Ground position resolution.

### shard-main__melee__gr__ground-034
This bounded shard covers six helpers: paired storage/access for the selected stage BGM and alternate-selection flag, an unchecked indexed StageData.flags2 lookup, and basis-to-Euler conversion with independent zero fallback for invalid angle components. Stage setup supplies the music state; timer-gated stage consumers select replacement audio, and VS exit copies the alternate-selection flag into EndMeleeData. Spline-driven callers apply the checked Euler output to model rotations.

### shard-main__melee__gr__ground-035-recovery5
Reviewed the six assigned Ground subjects. They apply fog RGB or black to the camera background, dispatch stage demo initialization, select fixed versus standard camera mode, retrieve indexed map objects without bounds checks, and retrieve player slot 0's primary or secondary logical fighter through the player subsystem's transformation mapping. Read callers confirm default camera restoration on unpause, nullable map-object handling, and optional secondary-fighter camera handling in Home-Run code. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__ground-036
Reviewed the six assigned subjects. Ground constructs stage-class objects with selectively initialized user data, archive-backed or fallback joint hierarchies, optional camera objects, and two scheduled processes. It also exposes the current yakumono pointer, dispatches stage load callbacks without guards, supplies an empty local lifecycle callback, guards writes to the stage parameter's y field, and delegates allocation release to HSD. Construction does not zero the entire Ground allocation, and its archive branch tests only the upper bound of map_id. This review does not establish complete TU coverage.

### shard-main__melee__gr__ground-037
Ground owns shared stage state and an indexed descriptor table. Its setup routines reset registries and camera/boundary defaults, select resources and callbacks, apply parameters, initialize common resources, and invoke the selected initializer. Accessors expose parameter colors, map objects, and registered joints; joint-position queries include midpoint and fallback handling. This review assesses the six assigned baseline facts, not the entire translation unit. The five assigned parameter subjects contain no baseline facts.

### shard-main__melee__gr__ground-038
The six assigned parameter subjects belong to single-argument color setters. Each function takes a GXColor pointer and copies the pointed-to value into stage_info.param: Ground_801C0574 writes xD8, Ground_801C058C writes xC4, Ground_801C05A4 writes xCC, Ground_801C05BC writes xD4, Ground_801C05D4 writes xBC, and Ground_801C05EC writes xC8. These bodies neither retain the input pointer nor check it for null. All six subjects have empty baseline fact lists, so there are no fact IDs requiring disposition.

### shard-main__melee__gr__ground-039
The assigned parameters supply a stage-kind selector, stage-ID pairs, a writable position vector, and an unused process-callback argument. Ground_801C06B8 indexes stage data and dispatches kind-specific calls. Ground_801C0754 uses both members of its stage-ID pair during setup; Ground_801C0800 selects stage data through grkind. Ground_801C0A70 writes a position using a randomized player-relative branch or delegates to Stage_80224FDC. Ground_801C0C2C performs global-state position checks and frame-gated descriptor submission without using its argument. Ground_801C0FB8 selects on_start through the pair, drains queued callbacks, and installs Ground_801C0C2C. All six assigned subjects have empty baseline fact arrays; there are no fact IDs to disposition.

### shard-main__melee__gr__ground-040
The assigned parameter subjects belong to four functions: Ground_801C10B8 prepends an object/callback pair to a deferred list; Ground_801C11AC sets the object's joint scale to (1,1,1); Ground_801C126C traverses joint descriptors child-first, decrementing a shared visit counter until it becomes negative; Ground_801C13D0 uses its first argument for archive lookup and entry selection, then loads either the root descriptor or a descriptor selected by that traversal. All six assigned subjects have empty baseline fact arrays, so there are no fact IDs to disposition.

### shard-main__melee__gr__ground-041
The six assigned parameter subjects have no baseline facts to disposition. The canonical bodies show: Ground_801C13D0's second argument selects a joint through a decrementing child-before-sibling traversal (zero selects the root), then loads it; Ground_801C1A20 takes a joint descriptor and an integer stored as map_id, constructs a ground object, loads the joint and installs two update procedures; Ground_801C1CD0 takes the object whose joint animation, material update and optional x8 callback it processes; Ground_801C1D38 forwards its object to an optional xC callback; Ground_801C1D6C ORs its unsigned argument into stage_info.flags. This is a bounded subject review, not complete TU coverage.

### shard-main__melee__gr__ground-042
The assigned subjects have no baseline facts to disposition. Their current function bodies expose two output pointers receiving stage_info.x6D4 and x6D2; an integer written to the flag gating fog application; a fog callback whose object supplies hsd_obj and whose second argument is unused; and a nullable color pointer copied into the existing stage fog. The callback is registered during fog-object initialization. This review covers only the bounded subjects, not the full translation unit.

### shard-main__melee__gr__ground-043
The six assigned parameter subjects have no baseline facts. Their canonical functions cover copying the stage fog color into an output pointer, filtering a null-terminated light-pointer array and modifying descriptor flags using archive overrides, scaling positions and interests along a light-object chain, and retrieving a spline using an archive-selection argument and an array index. Review is limited to these subjects, not the entire translation unit.

### shard-main__melee__gr__ground-044
The assigned subjects contain no baseline facts. Ground_801C24F8 takes a stage-kind lookup key, selection flags, and an output pointer. It searches stage parameters, chooses a BGM value using flags and conditional random selection, updates stage_info.unk8C.b0 on relevant paths, and writes the result through the output pointer. Its boolean result indicates selection of an available alternate entry. Ground_801C28AC forwards all three arguments and returns the resolver's result unchanged.

### shard-main__melee__gr__ground-045
The assigned subjects have no baseline facts. Current source shows Ground_801C28CC selecting a stage-parameter record by StKind and writing 35 integer products to its output buffer; missing records enter a diagnostic nonreturning path. Ground_801C2AE8 selects by StKind and returns the product of two percentage-scaled fields, likewise looping after a missing-record diagnostic. Ground_801C2BBC stores a map-object pointer at a supplied index. Ground_801C2BD4 registers a pointer in stage_info.x694, leaving existing entries unchanged, using the first empty slot, and asserting when capacity is exhausted. This review covers only the bounded assigned subjects.

### shard-main__melee__gr__ground-046
The six assigned parameter subjects have no baseline facts. Their current function bodies implement a pointer-equality search across four stage_info.x694 entries, indexed reads and writes of stage_info.x280 joint pointers, and a vector lookup with special-case averaging and recursive fallback paths. Ground_801C2D24 uses its first argument as the selector and its second as vector output; selectors 8 and 9 average recursively obtained vectors without checking the recursive return values. No gameplay meanings are assigned to numeric selectors.

### shard-main__melee__gr__ground-047
The assigned parameters belong to joint-processing helpers. Ground_801C2ED0 passes its JObj argument to mpLib_800552B0 for archive entries and matching stage entries selected by its integer argument. Ground_801C2FE0 extracts map_id from its Ground_GObj argument and processes associated joint entries only when the indexed state is zero, using a counter to avoid repeat processing in the archive pass. Ground_801C3128 uses its integer argument to select entries and invokes a callback with each entry's x value. Ground_801C3214 and Ground_801C3260 use their integer arguments as state-array indices and forward them to that iterator after opposite state transitions. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__gr__ground-048
The assigned subjects have no baseline facts. In their current function bodies, Ground_801C32AC forwards its sole argument to Ground_801C3128 with mpLib_80057424 as callback. Ground_801C32D4 and Ground_801C33C0 perform opposite x/z lookups: the first argument filters the stage table's y field and selects archive data; the second matches z or x respectively. Both return -1 if unmatched, with later matches overriding earlier ones. Ground_801C34AC uses its first argument to select an archive, finds an entry matching the supplied joint descriptor, traverses the supplied object hierarchy using index pairs, and stores resulting pointers in stage_info.x280.

### shard-main__melee__gr__ground-049
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions. The current bodies show that Ground_801C34AC uses a root object and joint-descriptor match to populate stage_info.x280 from indexed tree nodes; Ground_801C36F4 selects archive data using map_id, requires a matching joint entry, and clears references whose topmost parent is root. Ground_801C3880 assigns its float argument to the camera bounds' top field. Register-labelled parameter identities are not independently established by these source bodies.

### shard-main__melee__gr__ground-050
The assigned subjects belong to direct camera-state setters. Ground_801C3890, Ground_801C38A0, and Ground_801C38AC assign their f32 input to the bottom, left, and right camera bounds respectively. Ground_801C38BC writes its two f32 inputs to the camera X/Y offsets. Ground_801C38D0 writes four f32 inputs to vertical tilt, pan, x20, and x24. These bodies perform no validation or transformation. All six assigned subjects have empty baseline fact arrays.

### shard-main__melee__gr__ground-051
The three relevant function bodies directly store floating-point arguments into stage_info.cam_info. Ground_801C38D0 writes vertical tilt, pan degrees, x20, and x24; Ground_801C38EC writes maximum depth and zoom rate; Ground_801C3900 writes x3C, three pause-camera depth fields, and four directional angle fields. These bodies contain no validation or branching. All six assigned subjects have empty baseline fact lists, so there are no fact dispositions to return. Register-style subject suffixes are not established as canonical parameter bindings by the source read.

### shard-main__melee__gr__ground-052
Ground_801C3900 unconditionally copies eight f32 arguments into stage_info.cam_info: x3C, pausecam_zpos_min/init/max, and cam_angle_up/down/left/right. It performs no validation, conversion, calls, or additional state updates. All six assigned parameter subjects have empty baseline fact lists.

### shard-main__melee__gr__ground-053
Ground_801C3900 directly copies eight floating-point inputs into stage camera fields: x3C, three pause-camera Z-position fields, and four directional angle fields. Ground_801C392C directly copies six floating-point inputs into fixed-camera position, field-of-view, and vertical/horizontal angle fields. Neither body validates or transforms its inputs. All six assigned parameter subjects have empty baseline fact lists.

### shard-main__melee__gr__ground-054
The six assigned parameter subjects have no baseline facts. Their canonical functions directly assign floating-point inputs to stage state: Ground_801C392C sets fixed-camera position, field of view, and angles; Ground_801C3950 through Ground_801C3970 set fixed zoom, tracking ratio, and tracking smoothing; Ground_801C3980 and Ground_801C3990 set the top and bottom blast-zone bounds. These bodies contain no validation or additional calls. Register-style subject identities are not established by these C bodies.

### shard-main__melee__gr__ground-055
The reviewed setters store their floating-point arguments directly in the left and right blast-zone fields. Ground_801C3D44 and Ground_801C3DB4 each store a pointer and two halved floating-point inputs, set a request bit, update flags according to whether a stored result equals -1, and return that result. Ground_801C3D44 additionally copies a valid result into x6D0. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__gr__ground-056
The six assigned parameter subjects contain no baseline facts to assess. Their canonical function bodies show: Ground_801C3DB4 stores a pointer and half of each floating-point input in stage state, sets an activation bit, updates flag 0x40 according to whether x720 is -1, and returns x720. Ground_801C3E18 searches a joint, then its child subtree, then its next sibling for the first non-null animation object. Ground_801C3F20 returns that object's current frame, or zero when none is found. Ground_801C3FA4 starts at the attached joint's first child and advances by a traversal count, descending unless flag 0x1000 prevents it, then following siblings or ascending to find a sibling; it returns the selected joint or null.

### shard-main__melee__gr__ground-057
The six assigned parameter subjects have no baseline facts to disposition. Their canonical function bodies implement joint-tree successor traversal; two float output writes reporting stage_info.x724 and its difference from x728; a float update preserving the preceding value; argument forwarding to grZebes_801DA3F4; and pointer-key lookup returning an entry flag, with an assertion on an unmatched non-null key in a nonempty table. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__gr__ground-058
The assigned parameter subjects belong to light animation/render callbacks, ground-object cleanup, and spline sampling/orientation calculation. The light-animation routine traverses the supplied light chain but accesses position and interest through the original head pointer. Its process wrapper passes the game object's attached object; the render callback likewise uses the attached object and ignores its second integer argument. Ground cleanup accepts a nullable game object, invokes conditional cleanup and clears matching references before removal. The spline routine passes its spline input to two sampling helpers and computes three output angles. All six assigned subjects have empty baseline fact lists; therefore there are no baseline fact IDs to disposition.

### shard-main__melee__gr__ground-059
Ground_801C4B50 passes a spline and scalar parameter to spline-point evaluation, constructs a normalized vector basis, and writes three trigonometric angle components to its result vector. Ground_801C4D70 stores an object pointer, a copied Vec3, and a scalar in stage_info and returns true; Ground_801C4DA0 reads back the vector and scalar. All six assigned parameter subjects have empty baseline fact lists, so there are no baseline facts to disposition.

### shard-main__melee__gr__ground-060
Ground_801C4DA0 copies stage_info.x730 and stage_info.x73C into its Vec3 and float output pointers and returns true. Ground_801C4E70 sets stage_info.unk8C.b3 and passes six joint pointers individually to lb_8000B1CC, storing the resulting vectors in six stage_info fields. The entire bundle contains six parameter subjects and no baseline facts; there are therefore no fact dispositions to emit.

### shard-main__melee__gr__ground-061
The assigned subjects have no baseline facts to assess. Their current function bodies cover six joint-derived vectors stored in stage state, camera-dependent fog start/end calculations using those vectors, and two thin audio-call wrappers. Ground_801C4E70 passes its last two joint arguments to lb_8000B1CC and stores the resulting vectors in stage_info.x160 and x16C. Ground_801C4FAC uses its camera argument to obtain eye direction and position, selects or blends stored vectors, and sets fog distances with lower bounds. Ground_801C53EC forwards its argument with constants 0x7F and 0x40; Ground_801C5414 forwards its two arguments as the first and fourth arguments of lbAudioAx_80023870.

### shard-main__melee__gr__ground-062
The assigned subjects belong to three routines operating on Ground.x20 slots. Ground_801C5440 validates a non-null Ground pointer and an index in [0,8), leaves the slot unchanged for argument 540000, delegates to Ground_801C5544 for 540001, and otherwise passes an existing nonnegative-sentinel handle to lbAudioAx_800236B8 before storing the result of lbAudioAx_800237A8. Ground_801C54DC returns true only for a valid slot, non-null Ground pointer, a handle other than -1, and a truthy lbAudioAx_80023710 result. Ground_801C5544 passes a handle other than -1 to lbAudioAx_800236B8 and resets the slot to -1. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__gr__ground-063
The assigned subjects have no baseline facts to disposition. Their containing functions operate on Ground::x20 entries: Ground_801C5544 validates an index in [0, 8), calls lbAudioAx_800236B8 for a non--1 entry, and stores -1; Ground_801C55AC applies that operation to all eight entries. Ground_801C5630 and Ground_801C5694 validate the index and object, then pass an existing entry to audio helpers with respectively 127 * val and 63.5f * (val + 1). These observations describe canonical C behavior, not verified register assignments.

### shard-main__melee__gr__ground-064
The assigned subjects contain no baseline facts. The inspected implementations validate an eight-entry index before forwarding a stored handle and a transformed float to an audio routine; forward an integer to an optional stage callback; store integers in stage_info.x6D8 and stage_info.x740; and return stage_info.x6E0 without using the declared integer parameter. These are source-level observations, not confirmations of register-based parameter identities or gameplay meanings.

### shard-main__melee__gr__ground-065
The six assigned parameter subjects have no baseline facts. Their current containing bodies show: Ground_801C58E0 forwards its first argument to it_802F2094 and Toy_80304A58, while its second argument is passed to Ground_801C2D24 with a local vector subsequently supplied to it_802F2094. Ground_801C5A84 stores its argument in stage_info.x98; Ground_801C5AA4 stores its argument in stage_info.unk8C.b1. Ground_801C5AD0 indexes stage_datas and returns flags2. Ground_801C5AEC passes its first vector pointer to lbVector_EulerAnglesFromONB, then independently zeroes each component that fails the absolute-value comparison against 30000. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gr__ground-066
The assigned subjects contain no baseline facts. Current source shows that Ground_801C5AEC forwards its three trailing vector pointers to lbVector_EulerAnglesFromONB and then clears each output component whose absolute value is not below 30000. Ground_DemoInit selects a stage callback using pair->grkind and forwards its second argument unchanged. Ground_GetMapGObj directly indexes stage_info.map_gobjs using map_id without a local bounds check. This review covers only the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__gr__ground-067
The complete bundle assigns four parameter subjects and contains no baseline facts. There are therefore no fact dispositions to record. No new parameter semantics or register-to-source mappings are proposed, and this review does not establish complete function-body or translation-unit coverage.

### shard-main__melee__gr__ground-068
The reviewed Ground code configures camera and blast boundaries, registers stage components and auxiliary cameras, supplies magnification colors, prepares storage before stage loading, and performs rule-gated updates. Marker-query results feed a route-controller phase transition; paired level accessors connect animated stage height to animation selection. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gr__ground-069
Reviewed the twelve assigned links against current canonical bodies and selected consumers. Ground supplies camera-dependent fog endpoints, camera tilt and spawn-position inputs, map-component construction/destruction and joint mapping. Other reviewed helpers forward surface-contact effects, expose route-trigger state, scale sound controls and produce stage-specific parameter products. Some gameplay interpretations require additional evidence beyond the verified data flow; this is not complete TU coverage.

### shard-main__melee__gr__ground-070
This bounded review covers stage camera parameters, fog/background color, model animation, shared light access, and several gameplay-facing accessors. Current bodies confirm camera-parameter writes, hierarchical animation invocation, camera-direction-dependent fog calculations, and stage-color/light integration. Results-mode, barrel-mechanic, trophy-progression, and compiled-section attribution remain explicitly deferred where current evidence is insufficient.

### shard-main__melee__gr__ground-071
The reviewed Ground functions provide selected-stage setup and load dispatch, component construction, camera parameter storage, spline lookup, fog-color persistence, collision-joint association, and mode-dependent display selection. Two gameplay-specific links remain unverified. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__gr__ground-072-recovery7
Reviewed the twelve assigned links against current canonical Ground code and selected consumers. The reads support stage-object access and animation, fog gating, camera settings, item-spawn configuration, target-test completion checks, and cached Figure Get selection. Collision refresh is established, but its downstream contact-displacement semantics remain deferred. The route selector's generator call is established without independently establishing the Adventure Mode mapping. This is bounded link review, not complete TU coverage.

### shard-main__melee__gr__ground-073
Reviewed the twelve assigned concept links against current source. Ground provides shared stage lighting, fog access, camera and blast boundaries, asset-preload submission, and stage-state accessors. Caller evidence connects these helpers to fog restoration, music selection, magnifier colors, and the Zebes moving-level controller. Compiled-section identity and two stronger semantic interpretations remain deferred; this is not complete TU coverage.

### shard-main__melee__gr__ground-074
Reviewed the twelve assigned links, not the complete translation unit. Current source supports stage-start callback draining, stage-owned audio slots, archive-controlled light animation, stage BGM resolution, fog construction, and fixed-camera selection. More specific gameplay mappings remain deferred where the inspected code establishes only a supporting mechanism.

### shard-main__melee__gr__ground-075
Reviewed the twelve assigned links against current Ground bodies and selected consumers. Confirmed stage initialization, camera configuration, music resolution, Onett car-state exposure, Smash Taunt audio gating, and checked Euler extraction. Deferred compiled-section attribution and associations requiring stronger collision or route-progression evidence. This is bounded link coverage, not complete TU coverage.

### shard-main__melee__gr__ground-076
Reviewed the twelve assigned links against current canonical source. Ground supplies stage joints and magnifier colors, stores camera offsets and BGM-selection state, manages tracked audio cleanup, filters light descriptors, advances light animation, applies fog state, and supports scrolling terrain and spline-derived rotations. The match-rules association remains unresolved because the supplied caller location now contains results-screen setup rather than the claimed encounter configuration. This is bounded link coverage, not complete TU coverage.

### shard-main__melee__gr__ground-077-recovery7
The reviewed Ground bodies configure camera bounds and tracking, expose stage fog state and background color, manage indexed audio handles, and provide generic parameter/state accessors. Six concept links are supported by these bodies; six caller-dependent gameplay mappings remain explicitly deferred. This is not complete TU coverage.

### shard-main__melee__gr__ground-078
Reviewed the twelve assigned links against current canonical source. Ground provides stage defaults and deferred startup callbacks, shared joint-position references, camera-bound mutation, shadow intensity, light animation, target counters, cached display identifiers, and barrel-transform/state dispatch. Specific gameplay mappings whose current caller chains were not established remain unresolved; this is not complete TU coverage.

### shard-main__melee__gr__ground-079
The reviewed Ground routines initialize selected-stage resources and callbacks, configure blast-zone and camera rectangles, apply fog-derived background colors and rendering state, publish joint references, manage collision-group activation, dispatch stage-specific requests, and update a target counter. This assessment covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__gr__ground-080
Reviewed the twelve assigned links against current canonical bodies and relevant callers. Ground constructs and schedules map objects, publishes model-node references, exposes position registries, configures camera and blast boundaries, initializes fog and background color, and supplies stage-state integration points for HUD transitions and match outcomes. The section-level `.bss` identity remains unverified; this review does not establish complete translation-unit coverage.

### shard-main__melee__gr__ground-081
Reviewed the twelve assigned Ground links against current canonical code. The examined routines configure fixed-camera parameters and the bottom blast boundary, initialize and animate stage lights, scale light chains, select stage BGM, dispatch component collision operations, initialize Ground prerequisites, and spawn joint-attached objects during target-stage initialization. A stage timer consumer remaps the value returned by the music accessor below twenty seconds. Specific track identities and the buried-state consumer remain deferred; this is not complete TU coverage.

### shard-main__melee__gr__ground-082
The reviewed functions implement a stage-table joint-index lookup with archive overrides, configuration and reporting of a deferred rectangular position test, and a rule-gated periodic item request using generated positions. Their broader gameplay mappings require cross-file verification unavailable through the owned-file renderer.

Status: researched; no-change lead bypass; independent review and live promotion pending.
