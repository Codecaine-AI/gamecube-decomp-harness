# World Objects

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Fully reviewed C266/H76 canonical and rendered lines. UTC research 2026-09-08T14:51:50Z to 2026-09-08T14:54:19.544575+00:00.

## Entry Points

### HSD_WObjRemoveAnim
Detaches and destroys all animation state owned through an HSD_WObj: it removes the world object's own HSD_AObj, clears that attachment, and removes the animation controllers attached to every HSD_RObj in its relation-object list, while preserving the WObj and RObj structures themselves.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L18-L25

### HSD_WObjReqAnim
Requests that a world object's own position animation and every attached relation-object animation begin or resume from a supplied animation frame.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L27-L33

### HSD_WObjAddAnim
Attaches a composite world-object animation description to an HSD_WObj, replacing its previous property-animation controller and distributing the supplied relation-object animation descriptors across the WObj's existing RObj list.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L35-L44

### WObjUpdateFunc
Applies interpreted HSD_WObj animation channels to the object's position: channel 4 samples a point along the spline associated with the WObj's animation object, while channels 5, 6, and 7 update the X, Y, and Z position components respectively.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L46-L86

### HSD_WObjInterpretAnim
Evaluates one animation step for an HSD world object by interpreting its position-animation AObj through WObjUpdateFunc and then advancing animation for every attached relation object.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L88-L94

### WObjLoad
Initializes an existing HSD_WObj from an HSD_WObjDesc as the class's descriptor-load callback: it applies the descriptor position, replaces the object's relation-object chain, and resolves that newly loaded chain's descriptor references.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L96-L105

### HSD_WObjInit
Initializes or reinitializes an existing HSD_WObj from an HSD_WObjDesc by installing the descriptor's position, replacing the object's relation-object chain, and resolving the new chain's serialized references into live scene-object references.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L107-L119

### HSD_WObjLoadDesc
Constructs an HSD_WObj from a non-null descriptor by looking up its optional class_name. Missing or unregistered names fall back to HSD_WObjAlloc; a found class goes directly to hsdNew without a local WObj-descendant check. Calls the resulting object virtual load method and returns the object without inspecting that method integer result.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L131-L148

### HSD_WObjSetPosition
Replaces an HSD_WObj's stored three-dimensional position with a caller-supplied vector and marks that position as changed and directly specified. This common position setter is used when initializing WObjs and when updating the WObjs that represent camera eye and interest points.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L150-L159

### HSD_WObjSetPositionX
Sets a world object's X position while first materializing a spline-relative position into the associated JObj's transformed coordinate space when necessary.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L161-L177

### HSD_WObjSetPositionY
Sets the Y component of an HSD_WObj's position. Before replacing that component, it materializes a spline-relative position into transformed coordinates when possible, then leaves the object in direct-position mode and marks its position state as updated.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L179-L195

### HSD_WObjSetPositionZ
Sets the stored Z component and flag 0x2. When flag 0x1 is set and the AObj has an associated object, prepares its JObj matrix and transforms the full stored vector first. Clears 0x1 even when that association is absent, then replaces Z.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L197-L213

### HSD_WObjGetPosition
Retrieves an HSD world object's effective position into a caller-provided vector, first materializing a pending JObj-relative spline position into world coordinates when an associated JObj is available.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L215-L231

### HSD_WObjAlloc
Creates a new HSD_WObj through the HSD class system, using the configured default WObj subclass when one exists and otherwise using the base WObj class.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L233-L239

### WObjRelease
Performs the HSD_WObj-specific release phase: it destroys the world object's complete relation-object list and animation object, then delegates release of the remaining base-class state to the parent HSD object class.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L241-L247

### WObjAmnesia
Handles HSD class-amnesia notifications for the world-object subsystem by invalidating the cached default WObj class when that class is forgotten, then propagating the notification to the parent HSD object class.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L249-L255

### WObjInfoInit
Bootstraps the HSD_WObj runtime class as a subclass of HSD_Obj and installs the world-object release, class-amnesia, and descriptor-loading methods used through HSD class dispatch.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L257-L265

## Position and Animation State

Type 4 clamps val->fv in place with two ordered comparisons. NaN bypasses both clamps. The spline point goes through SetPosition, which sets bit0x2 and clears bit0x1, then the callback sets bit0x1 again. GetPosition and axis setters transform flagged positions only when both AObj and associated JObj exist; they clear bit0x1 even when the transform cannot run. GetPosition does not set bit0x2. Full-vector assignment is not a concurrency atomicity guarantee. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L46-L86; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L150-L231.

RemoveAnim preserves position and flags while clearing the AObj pointer. A flagged relative position may subsequently lose its transformation source. This is documented behavior, not a source-fix proposal. Relation animation changes participation flags through RObjAnimAll; this TU does not itself call a relation-constraint position evaluator. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L18-L44; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L88-L94.

## Classes, Headers, and Names

Class initialization uses the literal had_wobj, not hsd_wobj. LoadDesc accepts any class returned by lookup without a local descendant check, unlike SetDefaultClass, and ignores the virtual load return value. Init accepts null object/descriptor as a no-op; WObjLoad lacks those guards and returns zero. Neither replaces the direct AObj. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L96-L148; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.c#L257-L265.

All 17 canonical function names are retained; none has an inherited inferred-name fact. The inherited section alias default_class is a canonical object name but unresolved as section membership. All 26 parameter entities have no facts. Signatures distinguish mutable WObj pointers, Vec3 input/output pointers, f32 coordinates/frame, descriptor pointers, callback void* owner/enum_t channel/HSD_ObjData* value, HSD_Class* release instance, and HSD_ClassInfo* amnesia input.

The header defines WObj, descriptor, animation descriptor, and class-load slot layouts. HSD_WObjUnref calls release then destroy when ref_DEC returns true. The inspected ref_DEC returns true for the NOREF sentinel or when the old count is zero; it does not mean a conventional decrement-to-zero test. HSD_WObjClearFlags has no null guard. WObjSetupPosition is declaration-only here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/wobj.h#L12-L73; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L81.

## Coverage Limits

Four section targets have 16 unresolved facts. Source evidence does not prove .sdata string pooling, total byte size, exact section assignment, or emitted floating-point precision. No shared type edits, KB application, source changes, or runtime tests were performed. Foreign supporting reads are listed with hashes in coverage.json.
