# Animation Objects

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered C1-551/H1-104 fully read. Research UTC 2026-09-08T14:59:41Z to 2026-09-08T15:04:24.875676+00:00.

## Entry Points

### HSD_AObjInitAllocData
Initializes and registers the allocation descriptor used by the HSD object allocator for HSD_AObj instances, configuring it for sizeof(HSD_AObj) objects with four-byte alignment as part of the engine-wide object-allocation startup sequence.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L28-L31

### HSD_AObjGetAllocData
Exposes the AObj subsystem's shared HSD object-allocation descriptor so generic allocator operations and allocator-statistics reporting can operate on the pool used for HSD_AObj instances.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L33-L36

### HSD_AObjGetFlags
Provides a null-safe accessor for an animation object's complete flag word, allowing callers to inspect its playback and update-control state without directly dereferencing the HSD_AObj.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L38-L41

### HSD_AObjSetFlags
Enables the caller-configurable playback options on an animation object while preventing callers from setting its internal lifecycle flags: only looping and update-callback suppression are accepted, and a null animation object is ignored.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L43-L49

### HSD_AObjClearFlags
Disables caller-selected public playback options on an animation object, while preventing this generic flag API from clearing any AObj state other than looping and update-callback suppression.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L51-L57

### HSD_AObjSetFObj
Replaces the complete HSD_FObj chain attached to an HSD_AObj, first destroying any previously attached chain so the animation object retains only the supplied replacement.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L59-L69

### HSD_AObjInitEndCallBack
Begins a fresh animation-end callback accounting pass by clearing the subsystem-wide counts of animation objects that finish and remain active, allowing a subsequent traversal to decide completion solely from the AObjs interpreted during that pass.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L71-L75

### HSD_AObjInvokeCallBacks
Dispatches the animation subsystem's end-callback list after an interpretation pass has found at least one completed animation object and no animation objects still running.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L77-L89

### HSD_AObjReqAnim
Requests that an HSD animation object begin or resume playback from a specified frame, synchronizing both the AObj controller and every attached FObj channel to that frame.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L91-L105

### HSD_AObjStopAnim
Stops playback on an HSD_AObj by stopping every attached FObj animation channel and then marking the animation object inactive.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L107-L115

### HSD_AObjInterpretAnim
Processes one playback step for an HSD_AObj: it advances the current frame, handles first-play and looping boundaries, interprets the attached FObj animation channels, and stops a completed non-looping animation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L121-L174

### HSD_AObjLoadDesc
Materializes a serialized HSD_AObjDesc as a runtime HSD_AObj animation controller: it initializes the controller's playback options and frame bounds, constructs its property-animation channel list, and resolves or loads the optional HSD object referenced by the descriptor.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L179-L218

### HSD_AObjRemove
Performs null-safe teardown of an HSD animation object: it destroys the complete attached FObj chain, releases the animation object's reference to its attached HSD scene object, clears both attachments, and returns the AObj itself to its allocator.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L220-L240

### HSD_AObjAlloc
Allocates an HSD animation object from the subsystem's object pool and initializes it as a clean, stopped animation controller with normal playback speed.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L242-L251

### HSD_AObjFree
Returns one non-NULL HSD_AObj to the dedicated AObj allocator's reusable pool. It is the low-level storage-release operation used after HSD_AObjRemove has cleaned the animation object's attached FObj chain and retained scene-object reference; it does not perform that attachment teardown itself.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L253-L260

### callbackForeachFunc
Acts as the invocation adapter for HSD's generic animation traversal: it converts the traversal's untyped callback and tagged argument bundle into the selected concrete callback signature, allowing one traversal API to apply operations to AObjs with optional access to their owning scene object, object type, and caller payload.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L262-L307

### TObjForeachAnim
Traverses a linked list of HSD texture objects and applies a caller-supplied animation operation to each texture object's AObj when texture-object animation processing is selected.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L317-L326

### RObjForeachAnim
Traverses a linked list of RObjs and applies the requested animation-object operation to each RObj whose category is selected and whose AObj exists.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L328-L337

### DObjForeachAnim
Walks the DObj next list. For each node, optionally dispatches its direct AObj, then processes its material and the single PObj supplied by dobj->pobj. The polygon helper checks shape animation state but does not follow pobj->next.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L404-L415

### JObjForeachAnim
Traverses the animation-bearing portion of an HSD_JObj hierarchy and applies a supplied animation callback to each selected AObj associated with joints and their attached display and constraint objects.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L417-L434

### HSD_ForeachAnim
Provides the public, object-family-independent entry point for applying an animation-object operation across selected parts of an HSD scene graph. It chooses the traversal appropriate to the root object's HSD type, and the traversal helpers invoke the supplied operation for animation objects belonging to mask-selected joints, displays, materials, polygons, textures, lights, cameras, constraints, world objects, or fog.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L436-L508

### HSD_AObjSetRate
Configures an HSD animation object's playback rate, determining how far its current animation frame advances on each subsequent interpretation step.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L510-L516

### HSD_AObjSetRewindFrame
Configures the rewind boundary used when an HSD animation object loops, determining the frame range into which playback wraps after reaching the animation's end frame.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L518-L524

### HSD_AObjSetEndFrame
Configures the terminal frame boundary of an HSD animation object, which subsequent playback interpretation uses to decide when to loop, clamp, or stop the animation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L526-L532

### HSD_AObjSetCurrentFrame
Repositions an active HSD animation object to a specified frame and synchronizes all of its attached FObj animation channels to that frame without restarting an AObj that is already in the AOBJ_NO_ANIM state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L534-L545

### _HSD_AObjForgetMemory
Invalidates the AObj subsystem's global end-of-animation callback list when HSD memory is forgotten, ensuring later completion processing cannot traverse callback-list nodes retained from the discarded memory state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L547-L550

## Playback and Ownership

The public flag setters accept only LOOP and NO_UPDATE. ReqAnim restarts stopped controllers; SetCurrentFrame ignores stopped controllers. Neither validates the supplied frame. Rate/end/rewind setters are null-safe direct assignments without value validation. Allocation zeroes all fields, marks NO_ANIM and sets rate1. Descriptor load retains stopped state, uses only public flags, loads FObjs, resolves obj_id through the ID table or treats it as a Joint descriptor pointer. Remove releases FObjs and the retained JObj reference before pool release; Free itself only recycles storage. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L28-L260; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L510-L550.

HSD_AObjInitEndCallBack (inferred_type): void HSD_AObjInitEndCallBack(void): a parameterless reset routine that returns normally after zeroing the two completion counters.

HSD_AObjInterpretAnim (state_behavior): Null or already stopped AObjs return without accounting. First play clears AOBJ_FIRST_PLAY and uses zero rate; other calls advance curr_frame by framerate. At a looping end crossing, rewind_frame < end_frame stops FObjs, wraps with fmodf, and requests the wrapped frame; otherwise curr_frame clamps to end_frame. Both loop branches use zero interpretation rate and set REWINDED; ordinary steps clear it. NO_UPDATE substitutes NULL only for HSD_FObjInterpretAnimAll: loop-boundary and final-stop calls still receive update_func. Nonlooping end crossings stop FObjs and set NO_ANIM. Each eligible call increments one stopped or active counter according to its final flag state; these are call counts, not a census of distinct controllers.

HSD_AObjSetFlags (game_mapping): Enables looping and/or suppresses the owning-object callback during ordinary FObj interpretation. NO_UPDATE does not suppress the callback forwarded by loop-boundary or final-stop operations.

DObjForeachAnim (purpose): Walks the DObj next list. For each node, optionally dispatches its direct AObj, then processes its material and the single PObj supplied by dobj->pobj. The polygon helper checks shape animation state but does not follow pobj->next.

JObjForeachAnim (data_flow): Consumes a non-null JObj root and shared mask/callback context. Processes the current joint, its DObj union when applicable, and RObj list; unless INSTANCE is set, recurses through each child in the child next list. It does not follow the starting root next pointer. The mask selects callbacks without pruning attachment or child traversal.

HSD_AObjSetFObj (state_behavior): Null owner is a no-op. Otherwise removes the old FObj chain when present, then stores the supplied pointer, including NULL. There is no same-pointer or overlap guard: supplying the currently attached chain removes that chain before storing the same pointer.

HSD_AObjInvokeCallBacks (state_behavior): Returns unless the stopped counter is nonzero and active counter is zero. Otherwise starts at endcallback_list and invokes each current node data as void (*)(void), reading node->next after the callback returns. The routine itself does not reset counters or unlink nodes, and provides no snapshot or protection against callbacks mutating or freeing the traversal nodes.

src/sysdolphin/baselib/aobj.c (state_behavior): Interpretation ignores null or already stopped AObjs without counting them. First play uses zero rate; ordinary calls advance by framerate. Loop crossings wrap and re-request only for rewind_frame < end_frame; invalid intervals clamp at end_frame. Nonlooping end crossings stop. NO_UPDATE suppresses only the FObj interpretation callback, not stop callbacks. Explicitly reset counters classify each eligible interpreter call by its final state; callbacks are eligible when stopped is nonzero and active is zero.

Evidence for state corrections: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L43-L174; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L379-L434.

## Traversal and Missing Targets

callbackForeachFunc selects twelve callback signatures. A/AO/AOT do not consume payload; other variants consume f32, pointer, or u32. Unsupported private tags return silently, while public HSD_ForeachAnim panics on unsupported format/root types. Null public roots return before varargs setup; float varargs use f64 then f32. Type masks filter callback dispatch, not the traversal itself. No callback mutation safety is guaranteed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L262-L508.

Source-only Fog helper handles its own AObj. WObj handles its own then RObjs; CObj its own then eye/interest WObjs; LObj walks lights then position/interest; MObj its own then texture chain. PObj handles only the supplied polygon with shape-animation/shape_set/AObj guards. These six helpers lack report targets. Header getters assert nonnull and return current/end frame. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L309-L402; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.h#L91-L101.

## Names, Types, and Limits

All 27 report function names retained. fmodf is defined in foreign src/MSL/math.h89-98: magnitude guard, float division converted to long long quotient, then subtraction. No unrestricted IEEE exceptional-input guarantee follows from that implementation. Legacy fmod parameter entities remain unresolved; float argument register placement is not inferred from #r3/#r4 labels. Header defines the AObj fields, descriptor, AnimJoint, flag bits, twelve argument formats, and payload union. All empty parameter subjects were checked against signatures; no facts were invented. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/math.h#L89-L98; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.h#L13-L101.

Section facts remain unresolved pending compiled evidence. The canonical name aobj_alloc_data is visible but does not establish its section alias/layout. No source, shared KB, Git, UI, or published state was changed. This is a draft proposal only.
