# Polygon Object Runtime

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Owned pobj.c lines 1-1308 and pobj.h lines 1-153 were read canonically and as rendered snapshots to EOF. Receipts: `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__pobj/pages/`.

## Behavior by Target

### `.bss`

Provides the PObj subsystem's zero-initialized, two-slot matrix-mark storage. Each slot associates an opaque object identity with an HSD matrix kind so polygon and fighter rendering paths can test whether the required rigid matrix state is already represented before issuing GX matrix loads.

HSD_PObjClearMtxMark writes both object/mark entries and HSD_PObjGetMtxMark copies one entry to caller outputs. Rigid and shared-vertex matrix setup compare those values with joint identities and HSD_MTX_RIGID. Envelope setup resets both entries to NULL and HSD_MTX_ENVELOPE. The indexed setter does nothing for valid indices 0 and 1; only negative indices reach an out-of-bounds store.

The storage has two indexed states, slots 0 and 1. `HSD_PObjClearMtxMark` unconditionally makes both slots identical to a supplied pair; `HSD_PObjGetMtxMark` reads either valid slot without mutation and returns `(NULL, 0)` for every invalid index. The matched `HSD_PObjSetMtxMark` leaves both legitimate slots unchanged for indices 0 and 1 and rejects indices at least 2; only a negative index reaches a store, which is outside the array and therefore undefined. Thus normal rendering can reset and inspect the slots but cannot establish a new per-slot entry through the setter as matched.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L37-L40, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L955-L990, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1019-L1029, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L133-L141.

### `.data`

Provides pobj.c's writable initialized storage, most notably the bootstrap `hsdPObj` class descriptor from which the HSD polygon-object class is initialized and through which its lifecycle, loading, display, and model-matrix operations are dispatched.

`PObjInfoInit` expands the section's bootstrap `hsdPObj` record using the base `hsdClass` descriptor, PObj class and instance sizes, class-name strings, and PObj callback addresses. When no override class is installed, `HSD_PObjGetDefaultClass` returns `&hsdPObj`; `HSD_PObjAlloc` then passes that descriptor to `hsdNew`, and loaded or displayed PObjs obtain their load and matrix/display behavior through the resulting class method table.

The `hsdPObj` record begins in bootstrap state with `PObjInfoInit` as its significant initialized entry. Runtime class initialization turns it into a configured PObj class descriptor by establishing inheritance and identity metadata and then installing release, amnesia, display, matrix-setup, and load callbacks. If that class is forgotten, `PObjAmnesia` recognizes `&hsdPObj`, clears the module's reusable shape buffers and cached vertex-descriptor pointers, and delegates amnesia handling to the parent class.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1297-L1307, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L25-L25, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L347-L365, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1281-L1307.

### `.sbss`

Holds the PObj subsystem's zero-initialized module state: the optional default PObj class, reusable shape-animation vertex and normal scratch buffers with their capacities, and the last GX array and vertex-descriptor pointers used to suppress redundant GX configuration.

HSD_PObjSetDefaultClass writes the class override, while HSD_PObjGetDefaultClass and HSD_PObjAlloc consume it. Shape rendering allocates vertex and normal arrays when their recorded capacities are zero, writes interpolated geometry into those arrays, and passes the resulting buffers to the animated display-list path. Ordinary GX setup compares incoming descriptor-list pointers with the retained previous pointers, emits GXSetArray or vertex-format commands only when they differ, and then records the new pointers; clear and shape-animation setup paths invalidate those records.

The block begins in an all-null/all-zero state. A null default_class means allocation falls back to the base hsdPObj class; a non-null override is accepted only when it descends from hsdPObj. Zero buffer capacities trigger one-time lazy allocation of fixed default-sized shape buffers. Matching previous-descriptor pointers suppress repeated GX setup, while HSD_ClearVtxDesc and shape-animation setup invalidate one or both descriptor-cache entries. PObj class amnesia clears the override when its class is forgotten and resets all buffer and descriptor state when hsdPObj itself is forgotten.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L27-L35, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L347-L365, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L430-L531, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L831-L856, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1281-L1295.

### `.sdata`

Stores compact source-filename and assertion-expression diagnostic literals in the existing object snapshots. It is not a geometry table; object-source provenance remains unverified.

Existing object literals identify pobj.c and jobj.h plus allocation, matrix-output, and joint-matrix assertion expressions. PObj allocation and matrix-mark output assertions and the envelope matrix assertions independently establish diagnostic use. Do not infer the old seven-string envelope/shape-set inventory from source assertion spelling.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L978-L989, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L360-L365, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1149-L1170.

### `.sdata2`

Holds the PObj module's read-only numeric constants used by geometry decoding and mesh deformation, including bounds and zero/one values for shape blending and envelope-matrix accumulation.

Its constants are read by PObj geometry routines as arithmetic operands: fixed-point vertex and normal components are converted to floating point, shape-animation blend controls are clamped and applied to stored shapes, and envelope weights select or accumulate joint matrices before the resulting geometry and matrices are submitted to GX.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L533-L563, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L858-L953, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1150-L1175.

### `HSD_ClearVtxDesc`

Invalidates the active GX vertex-descriptor configuration and HSD's cached polygon-object vertex-array and vertex-descriptor identities, establishing a clean boundary before new vertex attributes are configured and ensuring later PObj setup does not reuse stale cached state.

Takes no explicit input. It sends a clear request to GX, then writes null to prev_vtxdesclist_array and prev_vtxdesc; setupArrayDesc and setupVtxDesc subsequently compare requested descriptor identities against those globals and repopulate GX state and the corresponding cache when they differ.

Executes an unconditional three-step invalidation sequence: clear all GX vertex descriptors, invalidate the cached vertex-array descriptor list, and invalidate the cached PObj vertex-descriptor list. It has no guards, branches, timers, or object-local state transitions; after it returns, both HSD descriptor caches are in their null sentinel state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L430-L435.

### `HSD_PObjAddAnimAll`

Attaches corresponding shape-animation descriptors across a next-linked HSD_PObj list, delegating each runtime polygon object and its positionally aligned descriptor to the single-PObj attachment routine.

Consumes an HSD_PObj list head and an HSD_ShapeAnim list head. Each current PObj and shape descriptor flow into HSD_PObjAddAnim; when a descriptor is present, its `aobjdesc` is loaded as a runtime HSD_AObj and replaces the AObj currently owned by that PObj's shape set. The PObj cursor always advances to `po->next`, while the descriptor cursor advances null-safely, so descriptors beyond the end of the PObj list are unused and PObjs beyond the end of the descriptor list receive no replacement controller.

If either list head is NULL, the function is a no-op. Otherwise it visits every PObj in order. Each visited PObj must be a shape-animation PObj with a valid shape set; a non-NULL aligned descriptor replaces that shape set's existing animation controller, while an exhausted descriptor chain leaves the remaining shape sets' controllers unchanged. An unmatched descriptor tail is ignored when the PObj list ends.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L76-L107, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.h#L12-L12, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L82-L99.

### `HSD_PObjAlloc`

Creates a new HSD polygon object through the HSD class system using the class selected by `HSD_PObjGetDefaultClass`, asserts that construction succeeded, and returns the resulting PObj.

Reads the PObj class descriptor returned by `HSD_PObjGetDefaultClass`, casts it to `HSD_ClassInfo*`, and supplies it to `hsdNew`. The resulting pointer flows through a non-NULL assertion and is then returned to the caller as an `HSD_PObj*`.

Performs one class-based construction attempt. Successful construction reaches the common assertion and return path with a non-NULL PObj; if class allocation or initialization causes `hsdNew` to return NULL, the PObj assertion fails instead of returning a usable object.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L347-L365.

### `HSD_PObjAnimAll`

Advances animation for every polygon object in a next-linked HSD_PObj list. Each shape-animation PObj evaluates its shape set's animation controller and applies the resulting channels to the shape-blend state; other PObj types are traversed but left unchanged.

Receives a PObj-list head from the owning display object's pobj field, follows each node's next pointer, and passes every node to HSD_PObjAnim. For a POBJ_SHAPEANIM node, that helper reads pobj->u.shape_set->aobj and passes it, the PObj as callback context, and PObjUpdateFunc to HSD_AObjInterpretAnim. Evaluated shape channels then flow into the shape set's additive weight array or its non-additive blend scalar.

A null head is a no-op; visits every next-linked PObj. Non-shape nodes do no animation work. Shape nodes pass their shape-set aobj, PObj owner and PObjUpdateFunc to HSD_AObjInterpretAnim. AObj timing, looping and null handling are delegated to that external implementation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L133-L171, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L155-L163.

### `HSD_PObjClearMtxMark`

Resets both entries of the polygon renderer's matrix-mark cache to a caller-supplied object/mark pair, establishing a uniform sentinel state before matrix setup begins.

Receives one opaque object identity and one 32-bit matrix-kind mark, copies that pair into mtx_mark[0] and mtx_mark[1], and returns no value. Later matrix-setup routines retrieve those slots to compare prior object and matrix-kind state before issuing GX matrix loads.

Unconditionally writes the same caller-supplied object and mark into both slots. Envelope setup calls it with NULL and HSD_MTX_ENVELOPE. The stored mark is an arbitrary u32 accepted without validation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L955-L963.

### `HSD_PObjDisp`

Draws one polygon object by applying its face-culling policy, invoking its class-specific model-matrix setup, and dispatching either the shape-animation renderer or the ordinary GX display-list path according to the PObj geometry type.

Reads culling bits and PObj type, configures the cull mode, forwards pobj, vmtx, pmtx and rendermode to the class setup_mtx callback, then dispatches shape animation or GXCallDisplayList with n_display << 5 bytes. pmtx is a prepared position matrix in the local matrix helpers, not an independently established projection matrix.

The culling flag pair has four states: neither flag enables `GX_CULL_NONE`, front-only enables `GX_CULL_FRONT`, and back-only enables `GX_CULL_BACK`; setting both flags suppresses the PObj entirely by returning before matrix setup or drawing. For drawable objects, matrix setup always precedes geometry dispatch. `POBJ_SHAPEANIM` selects the animated path and requires a non-null shape set, while every other type selects the ordinary display-list path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1220-L1259.

### `HSD_PObjGetFlags`

Provides null-safe read access to a polygon object's stored flags, allowing callers to inspect the PObj's configured geometry and rendering flags without directly dereferencing a possibly null pointer.

The caller supplies an HSD_PObj pointer. If it is non-null, `pobj->flags` flows unchanged to the `u32` return value; if it is null, literal zero is returned. The function performs no writes, calls, masking, or other transformation.

This query is side-effect free and has one guard: a valid PObj yields its current flags value, whereas a null PObj is treated as having no flags and yields zero.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L42-L48.

### `HSD_PObjGetMtxMark`

Retrieves one of the PObj subsystem's two cached matrix-state markers so rendering code can determine whether the required joint matrix state is already installed and avoid redundant GX matrix loads.

For index 0 or 1, the function copies mtx_mark[idx].obj and mtx_mark[idx].mark into caller-owned output storage. Matrix setup callers compare the returned object with the current or shared-vertex HSD_JObj and compare the mark with HSD_MTX_RIGID, then use the result to choose whether to load position, normal, and texture matrices. An invalid index instead writes NULL and 0.

Both output pointers are mandatory and trigger assertions when null. Indices 0 and 1 read the corresponding cache slot without modifying it; every other index follows a safe fallback path that returns NULL and 0.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L978-L990.

### `HSD_PObjLoadDesc`

Constructs a runtime PObj using a named registered class when found or HSD_PObjAlloc with the current default-class override otherwise. Calls the resulting virtual load method and returns the object; the load method return value is ignored.

A non-null HSD_PObjDesc supplies class_name to hsdSearchClassInfo. A missing name or failed lookup selects HSD_PObjAlloc, while a successful lookup supplies HSD_ClassInfo to hsdNew. The descriptor and resulting object then flow through the object's virtual load method before the populated HSD_PObj is returned. Under the base loader, descriptor data recursively produces the next PObj and initializes the runtime vertex descriptors, flags, display-list array, and type-specific shape-set or envelope-list payload. DObj loading consumes the returned PObj as its polygon attachment.

A null descriptor returns NULL without allocating. For a non-null descriptor, a null or unregistered class_name selects HSD_PObjAlloc; a registered class selects hsdNew and requires successful construction. Both paths converge on virtual descriptor loading and return of the resulting polygon object. With the base loader, the descriptor's type selects shape-set loading for POBJ_SHAPEANIM, envelope-list loading for POBJ_ENVELOPE, or no auxiliary allocation for POBJ_SKIN; any other type panics.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L281-L329, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L178-L182.

### `HSD_PObjRemoveAll`

Removes every polygon object in a next-linked HSD_PObj list by invoking the single-object removal operation on each node. It serves as the list-wide ownership cleanup used when a display object releases its complete polygon-object attachment.

Consumes an HSD_PObj list head. For each current node, it copies that node's next pointer before passing the current node to HSD_PObjRemove, then advances using the saved successor; the routine returns no value.

A null list head is a no-op. Otherwise removal proceeds from head to tail until the saved next pointer becomes null, with every node's successor captured before that node enters the single-object removal path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L331-L345, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L320-L329.

### `HSD_PObjRemoveAnimAllByFlags`

Selectively detaches and destroys the shape-animation controller of every eligible polygon object in a linked HSD_PObj list while preserving the polygon objects, their shape sets, and the list structure.

Visits the PObj list with the same flags mask. Selected POBJ_SHAPEANIM nodes pass shape_set->aobj to HSD_AObjRemove and set that field to NULL. The node, shape set and geometry references remain intact; internal AObj destruction is delegated.

Null list heads are ignored. Each node changes only if flags contains POBJ_ANIM and its type is POBJ_SHAPEANIM; it calls HSD_AObjRemove and clears aobj. This TU delegates null-controller handling to HSD_AObjRemove.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L50-L74, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L55-L67.

### `HSD_PObjReqAnimAllByFlags`

Requests that every eligible shape-animation polygon object in a linked HSD_PObj list begin or resume its animation from a supplied frame.

DObj control forwards a PObj head, startframe and flags. Every node receives the unchanged frame and mask; selected shape nodes forward their aobj and frame to HSD_AObjReqAnim. Controller and FObj state changes are delegated to that external routine.

Null list heads are ignored. Every node is visited and only POBJ_ANIM-selected shape nodes call HSD_AObjReqAnim with their controller and the requested frame. The local code does not validate controller presence or change its flags directly.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L109-L131, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L119-L127.

### `HSD_PObjResolveRefsAll`

Performs the list-wide post-load reference-fixup pass for polygon objects, pairing each loaded HSD_PObj with its source HSD_PObjDesc and converting serialized joint identifiers used by envelope and skin geometry into live, reference-counted HSD_JObj pointers.

Consumes a loaded HSD_PObj list together with the HSD_PObjDesc list that produced it. For each paired node, an envelope PObj traverses corresponding runtime envelope groups and descriptor arrays, releases each envelope entry's prior joint reference, resolves the descriptor's joint identifier through the HSD ID table, and stores and references the resulting HSD_JObj. A skin PObj similarly releases and clears its prior joint, then optionally resolves and references the descriptor's joint. Other PObj types are unchanged. All results are written into the existing PObj graph in place, and no value is returned.

A null runtime-list head or null descriptor-list head is a no-op. Resolution continues only while both current nodes are non-null, so only the corresponding prefix is processed and an unmatched suffix of either list remains untouched. Each envelope or skin joint reference transitions from its previous ownership state to the resolved HSD_JObj, with lookup success asserted; a skin descriptor with no joint transitions the runtime field to null, while unsupported PObj types retain their existing union state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L374-L428, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L268-L274.

### `HSD_PObjSetDefaultClass`

Configures the fallback runtime class used to allocate polygon objects, allowing a subsystem to substitute an HSD_PObj-derived class for ordinary descriptor loads and to restore the built-in PObj class by passing NULL.

The input class pointer is written to the PObj translation unit's default_class slot. HSD_PObjGetDefaultClass later reads that slot and substitutes hsdPObj when it is NULL; HSD_PObjAlloc passes the selected class to hsdNew, and HSD_PObjLoadDesc uses that allocation path only when the descriptor has no resolvable explicit class name.

Each call replaces the persistent module-wide PObj allocation override. A valid derived class installs the override, while NULL clears it so later fallback allocations use hsdPObj; the fighter-parts subsystem exposes paired wrappers that install ftPObj and clear the setting.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L347-L365, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L299-L339.

### `HSD_PObjSetMtxMark`

Serves as the indexed update operation for the polygon renderer's two-slot matrix-mark cache, whose object-and-mark pairs are consulted by rigid and shared-vertex matrix setup to avoid redundant GX matrix loads. The matched implementation does not actually update either legitimate slot because its valid-index branch is empty.

Receives a cache-slot index, an object identity, and a matrix-kind mark. Indices 0 and 1 are the values supplied by rigid/shared-vertex render paths, but the matched body discards both values without storing them; indices at least 2 also return immediately. A negative index reaches assignments to mtx_mark[idx], producing an out-of-bounds array access rather than updating a valid cache slot.

Implements no successful transition for the two legitimate matrix-cache states: idx 0 or 1 leaves both cache entries unchanged, and idx >= 2 is rejected. Only idx < 0 reaches a store, but that indexes before the two-element array and therefore invokes undefined out-of-bounds behavior. Consequently, normal calls cannot establish the cache hit that the surrounding matrix-setup routines expect.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L965-L976.

### `PObjAmnesia`

Handles HSD class-amnesia notifications for the polygon-object subsystem by invalidating PObj-global class, shape-animation work-buffer, and vertex-descriptor cache state associated with the forgotten class, then propagating the notification to the parent HSD class.

The incoming `HSD_ClassInfo*` is compared by identity with the class information cached in `default_class` and with the built-in `hsdPObj` class information. A default-class match writes NULL to `default_class`; a built-in-class match nulls `vertex_buffer`, `normal_buffer`, `prev_vtxdesclist_array`, and `prev_vtxdesc` and resets both buffer-size counters to zero. The original input pointer is then passed unchanged to the parent class's amnesia callback.

Cleanup is selective and compositional: forgetting the configured default class invalidates the PObj allocation-class override, while forgetting the built-in HSD_PObj class invalidates all retained shape-animation work-buffer and previous-vertex-descriptor state. The two guards are independent, and parent-class amnesia processing runs on every invocation regardless of whether either guard matches. Resetting the buffer sizes to zero causes the drawing path to allocate fresh work buffers when shape animation is next drawn.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1281-L1295.

### `PObjInfoInit`

Bootstraps the HSD PObj runtime class as a subclass of the base HSD Class, then installs the polygon-object lifecycle, display, model-matrix setup, and descriptor-loading methods used through HSD class dispatch.

Reads the global hsdClass descriptor as the parent class definition and writes the global hsdPObj descriptor: it first supplies the library and class identifiers plus HSD_PObjInfo and HSD_PObj sizes to hsdInitClassInfo, then stores the PObj release, amnesia, display, matrix-setup, and load function pointers into the initialized class table.

At runtime, the routine transitions the bootstrap hsdPObj class record into fully configured PObj class metadata: it establishes inheritance, identifiers, and size information before installing the lifecycle and PObj-operation dispatch callbacks.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1297-L1307.

### `PObjLoad`

Initializes an already allocated HSD_PObj from an HSD_PObjDesc by recursively loading the remainder of the polygon-object list, installing its shared geometry and display-list metadata, and constructing the runtime payload required by its polygon type.

The descriptor's `next` pointer flows through HSD_PObjLoadDesc into `pobj->next`, while `verts`, `flags`, `n_display`, and `display` are copied directly into the runtime object. The type encoded by the installed flags selects the descriptor union arm: a shape-set descriptor is converted into an allocated HSD_ShapeSet, an envelope descriptor array is converted into an HSD_SList of allocated envelopes, and a skin PObj receives no additional union initialization in this loading phase.

After installing the common descriptor fields, loading dispatches on `pobj_type(pobj)`: POBJ_SHAPEANIM installs a newly loaded shape set, POBJ_ENVELOPE installs a newly loaded envelope list, and POBJ_SKIN completes without initializing another payload here. Any other type is treated as an invariant violation and invokes HSD_Panic instead of returning normally; accepted types return 0.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L281-L308.

### `PObjRelease`

Performs type-specific teardown for an HSD polygon object before delegating its remaining base-class cleanup: shape-animation PObjs release their shape set and animation controller, envelope PObjs release every envelope and its joint reference, and skin PObjs release their held joint reference.

Consumes an HSD_Class pointer, views it as HSD_PObj, derives the active PObj representation from its flags, and forwards exactly one union payload to the appropriate ownership-release path: `u.shape_set` to HSD_ShapeSetRemove, `u.envelope_list` to HSD_EnvelopeListFree, or `u.jobj` to HSD_JObjUnrefThis. The unchanged original class pointer then flows to the parent release callback.

Release selects one specialized teardown branch from the PObj type: shape-animation cleanup is null-safe and, when additive, frees its blend-weight buffer before removing its AObj and shape-set allocation; envelope cleanup exhaustively removes every envelope in every list node while releasing each envelope's JObj reference; skin cleanup releases one internal reference to its JObj; other PObj types require no union-specific action. Parent-class release always runs last.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1261-L1279, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L188-L200, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L231-L251.

### `PObjSetupMtx`

Selects the polygon object's model-matrix setup strategy before drawing: rigid setup for shape-animation objects and skin objects without an attached joint, shared-vertex setup for skin objects with an attached joint, and weighted envelope setup for envelope objects.

Receives the PObj and rendering matrices from HSD_PObjDisp, reads the object's encoded PObj type and, for POBJ_SKIN, its union's joint pointer, then forwards pobj, vmtx, pmtx, and rendermode unchanged to the selected matrix-setup helper. Those helpers consume joint or envelope transforms and load the resulting position, normal, and projection-related matrices into GX.

Dispatches deterministically by PObj representation: POBJ_SKIN uses rigid setup when pobj->u.jobj is null and shared-vertex setup otherwise; POBJ_SHAPEANIM always uses rigid setup; POBJ_ENVELOPE always uses envelope setup. Unrecognized types perform no setup. The dispatcher has no timer or persistent state of its own.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1201-L1218.

### `PObjUpdateFunc`

Serves as the HSD_AObj result callback for polygon shape animation, committing each evaluated animation channel into the shape-set blend controls that drive animated geometry.

Receives an HSD_AObj-evaluated channel for a PObj, converts the opaque owner to HSD_PObj*, and, for a shape-animation PObj, writes val->fv either to blend.bp[type - HSD_A_S_W0] in additive mode or to the scalar blend.bl otherwise. drawShapeAnim later consumes those controls to construct interpolated or additively blended vertex and normal buffers before interpreting the display list.

Null or non-shape owners are ignored. A shape owner writes val->fv to blend.bp[type - HSD_A_S_W0] when SHAPESET_ADDITIVE is set and to blend.bl otherwise. There is no local channel-index or value-pointer validation, clamp, or timeline advance.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L133-L153.

### `SetupEnvelopeModelMtx`

Prepares the GX matrix palette for an envelope-skinned PObj by deriving one position matrix, and when required corresponding normal and normal-projection texture matrices, for each envelope entry.

Reads the current JObj and render mode to determine matrix requirements, then consumes up to ten entries from `pobj->u.envelope_list`. Each entry's joint matrices and weights become a blended model transform, which is optionally adjusted by the current model-node transform, composed with `vmtx`, and written to the corresponding GX position-matrix slot. When requested, the inverse transpose is also written to GX normal and texture-matrix slots.

Clears both marks to NULL/HSD_MTX_ENVELOPE and processes at most ten groups. If the first weight is >= 1.0f - FLT_EPSILON, uses only that first joint, including weights greater than one. Otherwise sums all joint-matrix/envelope-matrix products scaled by their weights without normalization. Loads position matrices and conditionally inverse-transpose normal and normal-projection texture matrices. pmtx is unused.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1125-L1199.

### `SetupRigidModelMtx`

Prepares GX matrix state for a rigidly transformed polygon object: it selects and loads the object's position matrix, and when the active lighting or texture-coordinate configuration requires normals, derives and loads the corresponding inverse-transpose matrix for normal lighting and normal-based texture projection.

Reads the current JObj and slot-zero matrix mark. A matching object and HSD_MTX_RIGID returns immediately. Otherwise calls the indexed setter, whose valid index path performs no store, then loads pmtx into GX_PNMTX0. Depending on GetSetupFlags and lighting, computes the inverse transpose and loads normal or normal-projection texture matrices. Each GX matrix load increments the performance counter.

A slot-zero match of both joint identity and HSD_MTX_RIGID suppresses all work. A miss calls HSD_PObjSetMtxMark but does not actually establish a new cache entry because its valid-index branch is empty. The position load still executes. Render bit 0x04000000 suppresses GetSetupFlags normal requirements; otherwise joint lighting and reflection/highlight textures request normal-related setup.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L992-L1049, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L965-L990.

### `SetupSharedVtxModelMtx`

Prepares the two GX position/normal matrix banks used by a skin PObj whose vertices are shared between the currently rendered JObj and a second JObj referenced by the PObj. It loads the supplied current-object position matrix into `GX_PNMTX0`, composes the view matrix with the referenced JObj's model matrix for `GX_PNMTX1`, and conditionally supplies corresponding normal and normal-projection texture matrices.

Reads the module's current JObj and matrix-mark slots, plus the secondary joint in `pobj->u.jobj`. If setup is required, it sends `pmtx` directly to GX position/normal bank zero, ensures the secondary joint matrix is current, computes `vmtx * pobj->u.jobj->mtx`, and sends that result to bank one. When normals are needed, each position matrix is converted to an inverse-transpose matrix and may be consumed by the GX normal-matrix and texture-matrix interfaces; every GX matrix submission increments the matrix-load performance counter.

Requests each joint only when both its object identity differs and its stored mark differs from HSD_MTX_RIGID. If neither joint is requested, returns. Otherwise both matrix-bank blocks execute: under MUST_MATCH their tests use bitwise OR with nonzero constants; without MUST_MATCH the guards are absent. This helper does not update the matrix marks. Normal and normal-projection loads depend on GetSetupFlags and joint lighting.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1051-L1123.

### `drawShapeAnim`

Builds the current CPU-side geometry for a shape-animated PObj by blending the shape set's positions and, when present, normals or NBT tangent frames, then draws that geometry through the shape-animation display-list interpreter.

Reads shape samples and animation blend values from `pobj->u.shape_set` and writes resolved XYZ data into shared vertex and normal buffers. With `SHAPESET_AVERAGE`, a scalar blend selects two adjacent shapes and its clamped fractional part linearly interpolates between them. Otherwise, shape zero is copied as a base and each later shape is added with its corresponding nonnegative blend weight. Normal data follows the same mode, using either one XYZ row per ordinary normal or three consecutive XYZ rows per NBT index. The completed buffers are consumed by `interpretShapeAnimDisplayList` for GX submission.

Lazily allocates fixed default vertex/normal capacities and asserts that current counts fit; no resizing occurs. A normal descriptor controls allocation and blend_nbt initialization, but later normal loops test nb_normal_index alone. Missing normal_desc with nonzero normal count violates the required input invariant and can read uninitialized blend_nbt. Average mode requires a positive shape count and clamps the shape coordinate; the other path uses base shape zero plus nb_shape nonnegative weighted samples at indices 1 through nb_shape without weight normalization.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L831-L953.

### `get_shape_nbt_xyz`

Decodes one indexed normal/binormal/tangent entry from a selected shape in an HSD shape set into nine floating-point components so the shape-animation renderer can blend the three-vector basis on the CPU.

Reads the selected shape's `normal_idx_list` and shared `normal_desc`; decodes the referenced source entry using the descriptor's index width, vertex base, and stride; converts its nine components from `GX_F32`, `GX_U8`, `GX_S8`, `GX_U16`, or `GX_S16` into floats, applying the descriptor's binary fractional scale for integer formats; and writes the result to the caller's destination buffer. `drawShapeAnim` blends these decoded samples into its normal buffer, which is then consumed as three consecutive normals per NBT index during GX display-list replay.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L652-L702, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L858-L953.

### `get_shape_normal_xyz`

Decodes one indexed XYZ normal from a selected shape in an HSD shape set into a three-float vector so the shape-animation renderer can blend that normal with normals from other shapes.

Reads the selected shape's normal index from `normal_idx_list`, interpreting GX_INDEX16 entries as two-byte big-endian values and other entries as one byte. It multiplies that index by the normal descriptor's stride to locate the source record, copies GX_F32 XYZ data directly or converts integer components using a `1 << frac` scale, and writes three floats that drawShapeAnim interpolates or accumulates into `normal_buffer` before display-list submission.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L610-L649, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L858-L953.

### `get_shape_vertex_xyz`

Retrieves one position from a selected shape in an HSD shape set and converts it to a three-component floating-point vector so the shape-animation renderer can blend or accumulate that vertex into its rendering buffer.

Reads `shape_set->vertex_idx_list[shape_id]` to map a logical shape-animation vertex slot to a vertex index, computes the source address as `vertex_desc->vertex + index * vertex_desc->stride`, and emits three floats to `dst`. Floating-point source data is copied directly; integer source data is converted to float and divided by `1 << vertex_desc->frac`. drawShapeAnim consumes these vectors to populate `vertex_buffer` through adjacent-shape interpolation in average mode or weighted accumulation in multi-target mode.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L565-L608, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L858-L953.

### `interpretShapeAnimDisplayList`

Replays a shape-animated PObj's packed GX display list in immediate mode, replacing position and normal references with CPU-blended vertex, normal, or NBT data while forwarding matrix indices, texture-coordinate indices, and color attributes to GX in their encoded formats.

Reads display bytes using a logical length n_display << 5 and a GX_VA_NULL-terminated vertex descriptor array. The outer loop requires l + 3 < length and stops on GX NOP, but the per-vertex attribute reads and buffer indices have no remaining-length checks. GXBegin receives opcode primitive/VAT bits and a big-endian count. Position and normal indices select blended floats; other supported attributes are forwarded in encoded form. Unsupported attributes log and consume one or two index bytes. Exact consumed bytes advance the outer cursor; malformed streams may read past the nominal length.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L704-L827.

### `loadEnvelopeDesc`

Builds the runtime envelope-group representation for an envelope-type HSD_PObj from its serialized descriptor: one HSD_SList node per descriptor group, containing a linked HSD_Envelope chain whose entries carry the group's joint weights. Joint identifiers are deliberately resolved into HSD_JObj references later.

PObjLoad passes `HSD_PObjDesc::u.envelope_p` into the function and stores its returned HSD_SList as `HSD_PObj::u.envelope_list`. For every inner descriptor entry, the function copies `weight` into a newly allocated, zero-initialized HSD_Envelope but leaves its joint pointer unset. HSD_PObjResolveRefs later walks the runtime list alongside the original descriptors and converts each descriptor joint identifier into a referenced HSD_JObj. Rendering then consumes each group as either a single full-weight joint transform or a weighted sum of its joint envelope matrices.

A NULL outer descriptor pointer returns NULL immediately. Otherwise, loading continues until the first NULL pointer in the outer array; each inner array is consumed until its first descriptor with a NULL `joint`. An empty inner group still produces an HSD_SList node whose data remains NULL, while a nonempty group preserves descriptor order in its HSD_Envelope chain. Allocation routines assert on failure, so the normal return path contains only fully allocated, zero-terminated runtime chains.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L173-L229.

### `loadShapeSetDesc`

Constructs the runtime HSD_ShapeSet payload for a shape-animated PObj from its serialized HSD_ShapeSetDesc, preserving the descriptor's shape geometry references while creating clean runtime blend and animation-controller state.

Allocates and zeroes an HSD_ShapeSet, then copies flags, shape count, vertex and normal index counts, vertex and normal descriptors, and their index-list pointers from the HSD_ShapeSetDesc. For an additive set it additionally allocates `nb_shape` floating-point blend weights and zeroes each one; otherwise it initializes the union's scalar blend value to zero. It finally clears the AObj pointer and returns the initialized shape set to PObjLoad.

The new shape set always begins with no attached HSD_AObj and with neutral blend state. If SHAPESET_ADDITIVE is set, neutral state is represented by a zero-filled per-shape weight array of length `nb_shape`; otherwise it is represented by a single zero scalar in the alternate blend-union arm. Failure to allocate the HSD_ShapeSet triggers the function's assertion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L253-L279.

### `resolveEnvelope`

Performs the post-load reference-fixup pass for an envelope PObj, pairing each runtime envelope-weight chain with its source descriptor sequence and converting every descriptor-held joint identifier into a live, referenced HSD_JObj pointer.

Receives a loaded outer HSD_SList of envelope chains and the corresponding original HSD_EnvelopeDesc pointer array from HSD_PObjResolveRefs. For each paired runtime envelope and descriptor entry, it releases the envelope's previous joint reference, looks up the descriptor's joint identifier in the HSD ID table, stores the resulting HSD_JObj pointer, asserts that lookup succeeded, and acquires a reference to the resolved joint. All results are written into the runtime envelope graph in place and no value is returned.

A null runtime list or null descriptor-pointer array makes the operation a no-op. Outer processing continues only while both a runtime list node and a non-null descriptor-sequence pointer remain; within each pair, processing continues only while both a runtime HSD_Envelope and a descriptor with a non-null joint identifier remain. Each processed envelope transitions from its prior joint ownership to ownership of the newly resolved HSD_JObj, and an identifier that does not resolve triggers an assertion; unmatched suffixes are left untouched.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L374-L393.

### `setupArrayDesc`

Binds the indexed vertex-attribute arrays described by a polygon object's HSD vertex-descriptor list to GX, while avoiding redundant array setup when the same descriptor list remains active.

For each descriptor before the `GX_VA_NULL` sentinel, `attr_type` selects whether processing is needed. Non-`GX_DIRECT` entries pass their attribute identifier, vertex-array base pointer, and stride to `GXSetArray`. After processing the list, the original list pointer is stored in `prev_vtxdesclist_array` for later calls.

Array bindings are cached by descriptor-list pointer identity rather than descriptor contents: a call with the currently cached pointer performs no GX operations, while a different pointer rebinds all non-direct arrays and becomes the new cached pointer. `HSD_ClearVtxDesc` invalidates this cache, and shape-animation array setup also invalidates it because that path installs a modified subset of the arrays.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L437-L449.

### `setupShapeAnimArrayDesc`

Configures the GX vertex-array bindings needed when rendering a shape-animated PObj while deliberately excluding position, normal, and NBT arrays, because those deformable attributes are emitted as direct floating-point vertex data by the shape-animation rendering path.

Receives `pobj->verts` from the shape-animation display path, scans its descriptors through the `GX_VA_NULL` terminator, and forwards each eligible descriptor's attribute, vertex base, and stride to `GXSetArray`. It then clears `prev_vtxdesclist_array`, preventing this partial shape-animation configuration from being reused as the ordinary array setup cache.

Always performs its selective array-binding pass rather than accepting the ordinary descriptor-list cache, then invalidates that cache on exit. Consequently, transitioning from a shape-animated draw to a normal PObj draw cannot incorrectly retain the shape-animation path's intentionally incomplete array bindings.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L479-L496.

### `setupShapeAnimVtxDesc`

Configures GX vertex input for rendering a shape-animated HSD_PObj. It makes positions, normals, and NBT vectors direct floating-point inputs so the CPU-generated blended geometry can be streamed immediately, while retaining each descriptor's configured delivery and format for matrix indices and other attributes.

Reads each HSD_VtxDescList entry from pobj->verts until GX_VA_NULL and translates it into cached GX vertex-descriptor and vertex-format state. Position, normal, and NBT metadata become direct GX_VTXFMT0 floating-point inputs with the descriptor's component count; matrix-index entries contribute only their delivery mode; all other entries contribute their configured delivery mode, component count, representation, and fractional precision. The resulting state is consumed by the subsequent shape-animation display-list interpreter, and prev_vtxdesc is cleared so a later ordinary PObj draw cannot reuse stale cached descriptor state.

Always discards the current GX vertex-descriptor configuration before rebuilding it; unlike ordinary PObj setup, it performs no descriptor-list cache hit check. Position, normal, and NBT attributes are forcibly transitioned to direct, unscaled GX_F32 input regardless of their stored indexed representation. Matrix-index attributes retain their stored delivery modes but receive no vertex-format entry, and all remaining attributes retain both their stored delivery and format metadata. On completion it invalidates the ordinary prev_vtxdesc cache.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L498-L531.

### `setupVtxDesc`

Prepares GX vertex-input state for an ordinary HSD_PObj display list by replacing the active vertex descriptors with those declared by the PObj's vertex-description list and configuring format 0 for every non-matrix-index attribute.

Reads the HSD_VtxDescList pointer from pobj->verts. For every entry, attr and attr_type flow to GXSetVtxDesc; for attributes other than position/texture matrix indices, attr, comp_cnt, comp_type, and frac also flow to GXSetVtxAttrFmt for GX_VTXFMT0. After configuration, the same list pointer is stored in prev_vtxdesc so later PObjs sharing that exact descriptor list can reuse the active state.

Uses descriptor-list pointer identity as a state-change guard. If pobj->verts equals prev_vtxdesc, it performs no GX calls. Otherwise it clears all active vertex descriptors, rebuilds them through the GX_VA_NULL terminator, omits GXSetVtxAttrFmt for the position-matrix and eight texture-matrix index attributes, and records the newly active list pointer only after rebuilding succeeds.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L451-L477.

### `TU`

Implements the HSD polygon-object subsystem: it loads and manages linked PObj geometry, fixes descriptor-held joint references after loading, attaches and controls shape animation, configures GX vertex data, interpolates animated shapes, and selects rigid, shared-vertex, or envelope matrix setup for rendering.

Consumes serialized PObj, shape-set, envelope, vertex-descriptor, display-list, and joint-identifier data; allocates linked runtime PObjs and animation payloads; replaces descriptor joint identifiers with reference-counted HSD_JObj pointers; derives interpolated vertices, normals, and model matrices; and submits vertex attributes and matrices to GX. Shape-animation requests enter through PObj list operations and are delegated to the HSD_AObj controllers owned by shape-set payloads.

Maintains a two-slot polygon-matrix mark store. Clearing assigns the same object identity and matrix kind to both slots, while indexed reads return a selected slot or the neutral pair `NULL, 0` for an out-of-range index. Rigid and shared-vertex setup consult these marks before issuing GX matrix loads, and envelope setup resets both slots to `(NULL, HSD_MTX_ENVELOPE)`. In the matched implementation, however, `HSD_PObjSetMtxMark` performs no store for the legitimate indices 0 and 1, rejects indices at least 2, and reaches an out-of-bounds store only for a negative index; consequently, ordinary setter calls cannot establish a new cache entry.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L281-L428, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L831-L953, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1125-L1259.

## Header and Ownership

pobj.h defines the next-linked runtime/descriptor pair, borrowed vertex/display pointers, discriminated joint/shape/envelope payload, typed vertex descriptors, envelope weights, shape sample index lists and blend union, animation chains, and the disp/setup_mtx/load class methods. Geometry pointers are borrowed; runtime envelope nodes, shape-set storage, additive weights and AObj references have separate release paths. PObjRemoveAll saves the successor before deletion. PObjFree calls class destroy directly, while PObjRemove uses hsdDelete; this packet does not equate the two external class operations.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.h#L22-L116, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L173-L308, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L331-L372, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1261-L1279.

## Source Preconditions

The shape average path clamps an integer shape coordinate and its fractional part, with no positive-count or finite-float validation. The additive path adds nonnegative weighted samples to shape zero without normalization. Normals are not normalized by the extraction or blend helpers. NBT emits nine components per logical entry. The display interpreter assumes valid descriptor and stream widths; its outer length guard does not protect inner reads.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L533-L827 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L831-L953.

## Existing Object Evidence

object-src.txt and object-obj.txt record section and symbol dumps. The source/target sizes are .data 877/880, .bss 16/16, .sbss 28/32, .sdata 52/56 and .sdata2 44/48 bytes. The target carries trailing zero extent where source payload ends; no matching or build-parity claim follows. The source object names mtx_mark in .bss and seven globals in .sbss. Its .sdata string contents contradict the inherited envelope/shape-set literal list. The numeric pool includes float/double zero and one and compiler integer-conversion constants.

## Coverage

Every subject and exact baseline fact version has a decision in coverage.json. Every outgoing baseline link is preserved and reviewed in link-dispositions.json. Research is complete locally and awaits independent parent review.
