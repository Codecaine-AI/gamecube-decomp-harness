# main/sysdolphin/baselib/robj

Status: TU synthesis complete; independent root review pending.

# Relation-Object Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Start 2026-09-08T14:59:51.099814Z; end 2026-09-08T15:05:32.692155+00:00. Every canonical and rendered line of robj.c1-943 and robj.h1-150 was read. File hashes, page metadata and foreign context reads are in coverage.json.

## Target Findings

### HSD_RObjInitAllocData

Initializes and registers the two fixed-size allocation descriptors used by the RObj subsystem: one for HSD_RObj relation records and one for HSD_Rvalue expression-input records, both configured with four-byte alignment during the common HSD object-allocation startup sequence.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L26-L30

### HSD_RObjGetAllocData

Exposes the relation-object subsystem's allocator descriptor so other code can inspect or use the allocation state associated with HSD_RObj instances.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L32-L35

### HSD_RvalueObjGetAllocData

Exposes the relation-object subsystem's dedicated allocation metadata for HSD_Rvalue records, allowing allocator clients to operate on the same pool configuration and state initialized for expression input values.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L37-L40

### HSD_RObjSetFlags

Null-safely enables one or more bits in an HSD relation object's flags without clearing any bits already present.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L42-L47

### HSD_RObjGetByType

Finds the first participating relation object in a linked HSD_RObj list whose encoded relation type matches the requested type and whose subtype either matches the requested subtype or is accepted through the zero-subtype wildcard.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L49-L75

### RObjUpdateFunc

Acts as the RObj animation callback that converts an interpreted TYPE_ROBJ float channel into the relation object's enabled-for-lookup flag.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L77-L95

### HSD_RObjAnimAll

Advances animation for every relation object in a next-linked HSD_RObj list. Each node's AObj is evaluated through the RObj-specific update callback, allowing an authored animation channel to enable or disable that relation object's participation in later relation lookup and constraint processing.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L97-L117

### HSD_RObjRemoveAnimAllByFlags

Applies flag-selected animation removal to every HSD_RObj in a linked list. It is the list-level constraint/relation-object cleanup primitive used when a JObj removes selected animation components from its attachments.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L119-L140

### HSD_RObjRemoveAnimAll

Detaches and destroys the animation controller attached to every relation object in an HSD_RObj linked list while preserving the relation objects and their list structure.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L119-L145

### HSD_RObjReqAnimAllByFlags

Requests that the flag-selected animation controllers of every relation object in a linked HSD_RObj list begin or resume from a supplied frame.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L147-L167

### HSD_RObjReqAnimAll

Requests that every animation controller attached to a linked HSD_RObj list begin or resume from a supplied frame.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L147-L172

### HSD_RObjAddAnimAll

Attaches a corresponding RObj animation descriptor to each relation object in a linked HSD_RObj list, applying the single-record attachment operation pairwise until either list is exhausted.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L174-L199

### HSD_RObjGetGlobalPosition

Finds the enabled joint-reference RObjs of a requested constraint subtype, ensures every referenced joint has a current matrix, and returns their average world-space position together with the number of contributing references.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L201-L240

### set_dirup_matrix

Computes cross-product direction/up/side vectors, regularizes direction and side lengths with approximately 1e-10, applies scale factors and emits three basis-column updates plus a completion callback. Zero or parallel inputs are not rejected and can produce collapsed axes.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L242-L270

### resolveCnsDirUp

Builds direction/up constraint updates from referenced joint positions, the destination position, and an explicit or fallback up vector. Applies the destination scl vector or unit scale and emits three basis updates and a completion callback; degenerate aim/up geometry is not rejected.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L272-L302

### resolveCnsOrientation

Resolves an orientation constraint by deriving three scaled orientation axes from the constraint's referenced joint and submitting them to the constrained object's update callback, thereby adopting the referenced joint's orientation while retaining the constrained object's existing per-axis scale.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L343-L437

### resolveLimits

Enforces scalar bounds from all REFTYPE_LIMIT records against local joint rotation and translation, without consulting the enabled bit. Rebuilds the joint matrix after any recognized subtype, including already-satisfied bounds.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L439-L541

### HSD_RObjUpdateAll

Applies relation effects in order: averaged subtype-1 position, direction/up constraint, orientation constraint, transform limits, and expressions. Reference and expression selection requires bit 31, but limit processing checks only REFTYPE_LIMIT and can affect disabled records.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L546-L568

### HSD_RObjResolveRefsAll

Performs the bulk post-load reference-fixup pass for an RObj list, pairing each runtime HSD_RObj with its source descriptor and resolving the relation's descriptor-held joint identifiers into live HSD_JObj references, including joint operands nested in expression-backed relations.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L570-L593

### HSD_RObjLoadDesc

Recursively creates an HSD_RObj chain from a nullable descriptor list. Copies flags and type-specific limit, expression, bytecode or IK-hint data; JObj pointer resolution occurs separately. Rotation-limit channels 1-6 convert degrees to radians, and loaded bytecode records become runtime expression type.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L598-L642

### HSD_RObjRemove

Performs null-safe teardown of one HSD_RObj, releasing the type-specific resource it owns, destroying its attached animation object, and returning the RObj itself to the RObj allocator.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L644-L660

### HSD_RObjRemoveAll

Performs null-safe teardown of an entire linked HSD_RObj list, disposing each relation object's type-specific retained data and animation object before returning the RObj node to its allocator. It is used when scene objects such as JObjs release their attached relation-object list.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L644-L670

### HSD_RObjAlloc

Allocates one HSD_RObj relation node from the RObj subsystem's object pool and returns it completely cleared so descriptor loaders and other callers can initialize its list linkage, flags, animation object, and type-specific union data.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L672-L678

### HSD_RObjFree

Returns one HSD_RObj instance to the reusable pool maintained by the RObj allocator, providing the low-level deallocation step used after an RObj's referenced resources and animation object have been removed.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L680-L683

### expEvaluate

Evaluates an HSD relation-object expression by gathering the expression's requested transform components from referenced joints, invoking either its native expression callback or the HSD bytecode interpreter, converting angular result channels back to radians, and submitting the resulting scalar through the constrained object's update callback.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L689-L809

### dummy_func

Provides the fallback native-expression callback for an HSD expression descriptor that has no function pointer, allowing expression evaluation to proceed safely with a constant zero result instead of calling NULL.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L811-L814

### HSD_RvalueRemoveAll

Destroys an entire linked chain of runtime HSD_Rvalue expression operands, releasing each operand's held joint reference and returning every Rvalue record to the subsystem's dedicated object pool. It is used when an expression-backed HSD_RObj is removed.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L824-L840

### expLoadDesc

Initializes the runtime HSD_Exp embedded in an expression-type relation object from an HSD_ExpDesc, preparing its function callback and referenced-value inputs for later expression-driven scene-object updates.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L842-L873

### bcexpLoadDesc

Initializes the runtime HSD_Exp embedded in a bytecode-expression relation object, preparing its serialized bytecode program and referenced joint-value inputs for later expression-driven scene-object updates.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L842-L888

### HSD_RvalueResolveRefsAll

Resolves every joint reference used by an expression Rvalue chain, converting the parallel descriptor list's serialized joint identifiers into live HSD_JObj pointers so the expression can subsequently read joint-backed values.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L890-L910

### HSD_RObjSetConstraintObj

Replaces the joint targeted by an RObj constraint while maintaining the joint's reference ownership and rejecting objects that are not HSD_JObj instances.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L912-L934

### _HSD_RObjForgetMemory

Invalidates the RObj expression evaluator's cached argument buffer when that buffer lies in a memory range being forgotten, ensuring that a later expression evaluation obtains fresh storage instead of retaining a pointer into the forgotten range.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L936-L942

## Ordering, Constraints, and Numerical Limits

HSD_RObjUpdateAll performs position, direction/up, orientation, limits, then enabled-expression updates. Type/subtype lookup requires bit31. Position averaging returns its count and leaves output untouched when none match. Limits use only their type predicate, so bit31 does not disable them. Cases11/12 clamp Y again rather than Z. Every recognized limit subtype requests a matrix rebuild even when it changes no scalar; the callback parameter is unused.

Direction/up normalization uses sqrt(1/(epsilon+dot)), so degenerate vectors need not become unit axes. The fallback +Z decision tests 1-dot(unnormalized aim,+Y) near zero; it does not cover every collinear aim. Orientation following similarly uses a column magnitude unchanged when it is <=1e-10 rather than inverting it. Therefore scale preservation and complete basis construction are conditional numerical properties, not guarantees for arbitrary transforms.

The callback protocol uses local vector storage and channels50-52 plus55 for orientation, and53 plus56 for averaged position. Callbacks must consume payloads synchronously. Limits mutate JObj fields directly. The actual obj pointer must support JObj access for constraint stages despite the void* API.

## Expressions and Lifecycle

Descriptor loading allocates recursively, preserving chain order. JObj references remain unset until the ID-resolution pass; corresponding runtime and descriptor lists are processed only while both remain. Bytecode descriptors are normalized to expression type in flags; is_bytecode selects evaluator behavior. Rotation limits1-6 convert degrees to radians. Native and bytecode descriptor loaders clear their output first, which does not clean prior owned Rvalues.

The evaluator lazily computes nb_args from all set bits, but explicit ignored bits 0x8,0x400,0x800 and unhandled bits produce no float. It does not clear the global buffer. Unsupported selected bits can leave advertised arguments beyond the produced prefix stale or uninitialized. Cached nb_args is not recomputed after flags change. A shared buffer also means nested expression evaluation can overwrite outer-call inputs. No thread or reentrancy protection is present. Exceeding capacity panics rather than resizing.

NULL expression descriptor is different from NULL function inside a valid descriptor: the former leaves a null callable pointer, while the latter installs dummy_func. A valid bytecode descriptor with NULL program sets bytecode mode and evaluates to zero in the checked callee. Angle channels1-3 are converted back from degrees after native/bytecode evaluation.

Constraint target replacement releases the old JObj before validating or retaining the new one. It does not check robj type, explicitly guard a NULL target, or protect self-assignment. Whole-list removal saves next before freeing and does not clear the owner's list field. Pool free itself is unguarded; higher-level Remove supplies null tolerance and resource cleanup. Memory-forget only clears the scratch pointer/capacity when the pointer address is in [low,high); it does not free the buffer or test overlapping allocation ranges.

## Header and Unindexed Functions

The complete header defines relation tags, Rvalue linked nodes and sentinel descriptor arrays, IK hints, native/bytecode expression descriptors, the tagged RObj union, and RObj animation descriptors. nb_args is u32; the -1 sentinel is the unsigned all-ones value. Native callback type is f32(*)(void*). RObjHasFlags checks expression type, RObjHasFlags2 tests bit31, and RObjHasLimitReftype checks only limit type. No exact writable shared type or field entity appears in the manifest.

Source functions without targets were reviewed as helpers: single-object animation/request/removal/attachment, subtype lookup, parent lookup, duplicate typed lookup, single-record reference fixups, Rvalue allocate/remove/load, and header predicates. loadRvalue copies flags into zeroed nodes until joint==NULL and leaves references for later resolution. Their semantics support the owned list wrappers but no unowned subject is proposed.

## Naming and Coverage

All canonical function names remain. None of the 32 function targets has a current inferred-name fact; the file alias RObj is retained. No new names are proposed. Source render reports six parse errors and zero substitutions; header reports zero parse errors and substitutions. Complete text was reviewed despite parse annotations.

All 20 section facts remain unresolved because no compiled map/object attribution was checked. The archived no-shipped-bytecode-use claim also remains unresolved pending a reachability audit. Local bytecode evaluation and its NULL-program behavior are established independently.

{"targets": 38, "entities": 61, "facts": 162, "retained": 123, "superseded": 18, "unresolved": 21, "proposed_facts": 78, "parameter_entities": 60}

Every current fact has its ID, frozen updated_at revision, explicit disposition and full pinned canonical evidence in dispositions.json. All 60 parameter entities receive source-backed type/role descriptions. Proposal remains dry-run only pending independent review.


## TU independent review

GetByType requires bit31 and exact type, subtype0 wildcard. Update type1 compares>=.5; NaN clears enable. Animation masks80 select category. Paired add loops stop at either end. Global position averages enabled matching references and leaves output unchanged if none. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L26-L240`.

Direction/up basis regularizes denominator with epsilon, not exact normalization. Fallback tests raw1-dot to up, not normalized parallelism. Orientation copies normalized-above-threshold columns; tiny columns are multiplied by magnitude, not normalized. Parent scale handling delegates inverseconcat and concat. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L242-L437`.

Limit predicate ignores enable bit. Types1..6 rotation,7/8 translateX,9..12 translateY; no translateZ. Recognized limit always requests matrix rebuild even unchanged, NaN bypasses ordered comparisons. Update sequence position, direction/up, orientation, limits, enabled expressions. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L439-L568`.

Descriptor JObj references deferred; angular limits degrees->radians, bytecode type canonicalizes EXP; expression nullable descriptor leaves zero struct. Removal type-specific before AObj and storage. Reference resolution releases old before lookup/assert/retain. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L570-L683`.

Cached popcount counts ignored channels, leaving tail arguments uninitialized/stale. Shared100 float buffer no growth or reentrancy guarantee. Values ordered by list/bit, rotational input degrees and types1..3 output radians. Expression function type f32(void*); NULL expression descriptor not evaluable. SetConstraintObj releases before ancestry check and does not validate RObj union type. Forget tests half-open range. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L689-L943`.

Exact EXP union f32(*)(void*)/u8*, nb_args u32 sentinel -1, expression and enable predicates separate, limit ignores enable. C6 parse errors H0, no substitutions. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.h#L1-L150`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
