# Joint Object Scene Graph

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered jobj.c lines 1-1579 and jobj.h lines 1-758 read to EOF. Receipts: `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__jobj/pages/`. Render parse diagnostics do not establish canonical-source errors.

## Behavior by Target

### `.data`

Contains the leading 80-byte hsdJObj bootstrap class descriptor, longer assertion and class strings, switch-related storage, MUST_MATCH-retained diagnostic strings, and unused14, the six-u32 zero block at offset 0x3BC in the existing objects. Source extent is 980 bytes and target extent 984 with trailing zeros. Object build provenance is unverified.

The static hsdJObj image supplies JObjInfoInit to the HSD class bootstrap path. When invoked, that callback reads the parent hsdObj descriptor, initializes hsdJObj's class identity and object-size metadata, and writes JObjInit, JObjRelease, JObjAmnesia, matrix construction, position-matrix construction, display, descriptor-loading, and child-release callbacks into the descriptor for later generic class dispatch.

The hsdJObj descriptor has a two-stage lifetime: its static image initially contains only the JObjInfoInit bootstrap entry, and runtime class initialization turns it into a configured subclass descriptor by establishing inheritance and size metadata before installing its virtual operations.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1558-L1578, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L20-L21, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L674-L680, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1541-L1556.

### `.rodata`

Stores numeric vector constants used to initialize the IK solvers: a unit-scale aggregate initializer and the canonical zero and unit Vec3 globals. Existing object snapshots distinguish the 36-byte source payload from the 40-byte target extent; build provenance is unverified.

resolveIKJoint1 starts accumulated scale at {1,1,1} and copies HSD_JObj_803B94C4 as a zero origin. resolveIKJoint2 copies HSD_JObj_803B94D0 as default unit scale. Existing .rodata objects contain these three vectors, without diagnostic strings.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1254-L1255, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1116-L1152, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1283-L1291.

### `.sbss`

Stores the JObj subsystem's process-global, zero-initialized runtime configuration and context: an optional allocation class, a custom animation-channel callback list, three animation-event handlers for dynamic particles, sound, and particle targets, and the JObj currently exposed to rendering code.

The optional default-class pointer feeds `HSD_JObjAlloc`, which falls back to the base JObj class when the slot is NULL. Interpreted SETBYTE and SETFLOAT animation channels traverse `ufc_callbacks`; event channels 0x28, 0x29, and 0x2A conditionally invoke the dynamic-particle, sound, and particle-target handlers. `HSD_JObjSetDPtclCallback` replaces the dynamic-particle slot, while `HSD_JObjSetCurrent` retains its input, releases the previous `current_jobj`, stores the replacement, and makes it available through `HSD_JObjGetCurrent`.

All six slots begin NULL. A non-NULL default class overrides base-class allocation until replaced, cleared explicitly, or invalidated by class amnesia. Event dispatch is disabled independently for each NULL callback slot, and registering a dynamic-particle callback unconditionally replaces its previous value. The current-JObj slot uses retained ownership during replacement; JObj class amnesia clears both the custom-channel callback list and current rendering context, while amnesia for the selected default class clears that class override.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L23-L28, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L434-L487, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1045-L1063, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1461-L1464, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1529-L1539.

### `.sdata`

Stores compact assertion filename and expression strings in the existing object snapshots. These support diagnostics for JObj pointers, path/camera references, tree predecessors, and IK requirements; they are not the unused root strings or zero block.





Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1087-L1098, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L369-L372, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L583-L583, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L866-L868.

### `.sdata2`

Provides the JObj translation unit's compiler-emitted read-only floating-point constants for animation-value handling and inverse-kinematics matrix calculations.

Animation interpretation reads bounds and thresholds for path, scale and visibility channels. Matrix and IK code use the literal pool for epsilon-regularized normalization, geometric calculations and angle limiting before writing scaled axes and translations. Degenerate inputs do not guarantee a valid orthonormal basis; the near-zero IK1 branch consumes uninitialized temporaries.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L351-L433, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1183-L1250, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1304-L1382.

### `HSD_JObjAddAnim`

Installs the animation controllers for one HSD_JObj: it replaces the joint's transform animation object, attaches constraint animation to its RObjs, synchronizes the joint's classical-scaling mode with the animation descriptor, and attaches optional material and shape animation to DObjs.

A non-null AnimJoint supplies the replacement AObj descriptor, RObj animation list, and classical-scaling flag. Any old `jobj->aobj` is removed before the loaded AObj is stored and sorted; the RObj animation is forwarded to `jobj->robj`, and descriptor flag bit 0 selects whether JOBJ_CLASSICAL_SCALE is set or cleared. For a DObj-bearing JObj, MatAnimJoint and ShapeAnimJoint data are independently forwarded to the attached DObj chain, with a missing descriptor represented by NULL.

A null JObj is a no-op. With a non-null JObj, joint-transform, constraint, and classical-scale state changes only when an AnimJoint is supplied; supplying one replaces any existing AObj and makes its flag bit 0 authoritative for JOBJ_CLASSICAL_SCALE. Material and shape attachment is handled independently whenever the JObj owns DObjs, including when either corresponding descriptor is absent; particle and spline union variants skip that DObj path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L298-L321, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L279-L296, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L277, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L531-L565.

### `HSD_JObjAddAnimAll`

Attaches corresponding joint, material, and shape animation descriptors across an entire HSD_JObj hierarchy so the hierarchy can subsequently be requested and advanced as an animated model.

For each visited JObj, forwards the currently corresponding AnimJoint, MatAnimJoint, and ShapeAnimJoint nodes to HSD_JObjAddAnim. That callee replaces or loads the JObj's AObj from the joint descriptor, installs RObj animation data, updates classical-scaling state, and forwards material and shape animation data to attached DObjs. Recursion then advances through JObj siblings unconditionally while advancing each non-null descriptor sibling chain independently.

A null root is a no-op. A non-null root always receives the current animation descriptors, but a JOBJ_INSTANCE node terminates child descent. Otherwise recursion begins with the child nodes of each available descriptor tree and continues for every JObj child; missing descriptor branches remain null while the JObj traversal continues.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L323-L347, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L298-L321.

### `HSD_JObjAddChild`

Attaches a standalone JObj subtree root to a parent JObj as the parent's first child or as the last sibling in its existing child list, then updates the ancestor hierarchy's JOBJ_ROOT_MASK summary flags to account for the new child.

The parent and child JObj pointers supply the hierarchy links being modified. The function writes parent->child when the list is empty or writes the terminal sibling's next pointer otherwise, writes child->parent, then computes the child's contribution as (child->flags | (child->flags << 10)) & JOBJ_ROOT_MASK and ORs any newly contributed bits into successive ancestors until an ancestor already contains them.

Insertion is skipped if either argument is null. Otherwise the child must be detached and siblingless. A parent marked JOBJ_INSTANCE may receive a first child but may not have another child appended; for an ordinary parent, insertion preserves existing sibling order by appending at the tail. The traversal asserts that it does not encounter the child, and ancestor flag propagation stops as soon as the next ancestor already contains every contributed root-mask bit.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L816-L852.

### `HSD_JObjAddDObj`

Attaches a display object to a compatible JObj by prepending it to that joint object's DObj chain, allowing multiple display objects to be associated with one model joint.

On a valid call, the current `jobj->u.dobj` head is copied into `dobj->next`, after which `jobj->u.dobj` is replaced with `dobj`. Thus the supplied DObj becomes the new head while preserving the previous chain as its successor.

The attachment is an all-or-nothing guarded transition: a null JObj, null DObj, or JObj whose union is not in DObj mode leaves both objects unchanged; otherwise one head-insertion updates the JObj's DObj chain without traversing it.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L939-L946, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L253, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L531-L541.

### `HSD_JObjAddNext`

Inserts one JObj as a new parent above the hierarchy level containing another JObj, preserving the former sibling chain as children of the inserted node and preserving any children the inserted node already had.

For a parented input, saves the old parent child head, clears that parent child link, and clears JOBJ_ROOT_MASK on jobj itself. Reparents next to the old parent, appends the saved sibling chain after next existing children, rewrites each moved node parent to next, and propagates child-derived render-pass summary bits through ancestors. For an unparented input, the moved chain starts at jobj. Aliased or cyclic inputs are not validated comprehensively.

If either argument is null, the hierarchy is left unchanged. Otherwise, when `jobj` has a parent, that parent's entire child list is replaced by `next`; when `jobj` is a root, the chain beginning at `jobj` is placed beneath `next`. Existing children of `next` remain first and the moved chain is appended after them, after which all moved nodes consistently name `next` as parent.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L878-L907, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L799-L876, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L90-L99.

### `HSD_JObjAlloc`

Creates a new HSD_JObj through the HSD class system, using the configured default JObj subclass when one is installed and otherwise using the standard JObj class, then asserts that construction succeeded.

Reads the module's `default_class` pointer, selects it when non-NULL or selects `&hsdJObj.parent.parent` otherwise, passes the selected class metadata to `hsdNew`, checks the resulting HSD_JObj pointer with an assertion, and returns that pointer to the caller.

Has two class-selection paths controlled by whether `default_class` is installed. Both paths construct one object and converge on the same assertion and return path; the function only reads the class configuration and does not modify it.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1045-L1051.

### `HSD_JObjAnim`

Evaluates one HSD_JObj's animation state: it resolves transform dependencies, advances the joint's AObj channels through the JObj property-update callback, advances attached RObj animation, and advances attached DObj animation when the JObj's union currently represents display objects.

Consumes a nullable JObj and reads its AObj, RObj list, union-type flags, and DObj union arm. Dependency checking prepares the joint for evaluation; the AObj's current playback state and FObj channels flow through JObjUpdateFunc into joint properties such as transform and visibility; the RObj list is animated independently; and, for a DObj-bearing joint, the DObj chain is also animated. The routine returns no value and does not traverse child or sibling JObjs.

A NULL JObj is an immediate no-op. For a non-NULL JObj, processing is ordered as dependency resolution, joint AObj interpretation, RObj animation, then optional DObj animation. The DObj phase runs only when the JObj uses the DObj union arm. This routine neither recurses into descendants nor initializes or invokes animation-end callbacks; the hierarchy-wide HSD_JObjAnimAll wrapper supplies those phases.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L531-L541, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L30-L55, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L349-L529.

### `HSD_JObjAnimAll`

Evaluates animation for an entire HSD_JObj hierarchy, including each joint's own animation and its attached render-related objects, while collecting and then invoking animation-end callbacks for the traversal as one operation.

Consumes a nullable root JObj. For each visited node, it checks transform dependencies, interprets the node's AObj through JObjUpdateFunc, advances attached RObj animation, and advances attached DObj animation when the node uses the DObj union arm. It then recursively processes the node's children through child and next links. Animation-end callbacks accumulated during this work are invoked only after the hierarchy traversal returns; the routine has no return value.

A NULL root is a no-op and does not initialize or invoke callbacks. For a non-NULL root, traversal is pre-order: the current JObj is animated before its descendants. A JOBJ_INSTANCE node is animated itself but suppresses recursion into its child hierarchy. Animation-end callbacks are initialized before traversal and invoked after traversal completes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L558-L565, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L531-L556.

### `HSD_JObjCheckDepend`

Checks matrix dependencies and sets this JObj raw dirty bit when the selected dependency policy requires it. The helper dirty predicate excludes user-defined matrices, so setting their raw bit does not make ordinary HSD_JObjSetupMatrix rebuild them.

Reads the dirty predicate, user-defined/parent-independent flags, parent link and flags, IK-role bits and robj. It may OR JOBJ_MTX_DIRTY into this node. User-defined mode tests the parent through HSD_JObjMtxIsDirty; ordinary mode tests the parent raw bit directly. These are different tests, and USER_DEF_MTX makes the helper predicate false regardless of the raw bit.

Null is ignored. The guard uses HSD_JObjMtxIsDirty, which is true only when USER_DEF_MTX is clear and MTX_DIRTY is set. Thus ordinary dirty nodes skip checks, while user-defined nodes enter checks even with their raw dirty bit set. User-defined nodes set the raw bit only when parent-dependent and the parent dirty predicate is true. Ordinary clean nodes set it when the parent raw dirty bit is set, an IK role is present, or robj is non-null. No descendant propagation occurs here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L30-L55, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L234.

### `HSD_JObjClearFlags`

Clears caller-selected bits on one JObj and conditionally invokes dirty propagation using the XOR of the old flag word and supplied mask. This literal test does not guarantee invalidation for every actual classical-scale change.

For non-null input, compares the old JOBJ_CLASSICAL_SCALE bit with that bit in the supplied mask. On mismatch, calls HSD_JObjSetMtxDirtySub only if HSD_JObjMtxIsDirty is false. That predicate excludes USER_DEF_MTX even when the raw dirty bit is set. Finally clears the requested bits with flags &= ~mask.

Null is ignored. Tests (old_flags XOR input_mask) & JOBJ_CLASSICAL_SCALE before applying the mask. If nonzero and HSD_JObjMtxIsDirty is false, calls SetMtxDirtySub. USER_DEF_MTX makes this predicate false even when the raw dirty bit is set. Then clears the supplied bits through jobj->flags &= ~arg1. The XOR is not a test of whether the final scale bit changes; for ClearFlags, clearing an already-set classical-scale bit with that bit in the mask does not trigger this invalidation path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1019-L1030, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L234, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1445-L1459.

### `HSD_JObjClearFlagsAll`

Clears a supplied set of JObj flag bits from a root joint and its recursively reachable descendants, providing a hierarchy-wide counterpart to HSD_JObjSetFlagsAll. Nodes that remain marked JOBJ_INSTANCE after their own update act as traversal leaves.

Consumes a nullable root HSD_JObj and a u32 flag mask. At each reached node, HSD_JObjClearFlags conditionally invalidates a clean cached matrix when its JOBJ_CLASSICAL_SCALE comparison succeeds, then removes the mask from `jobj->flags` with `flags &= ~mask`. HSD_JObjClearFlagsAll reads the resulting instance bit and, if clear, follows the node's `child` and `next` links while passing the same mask recursively.

A null root is a no-op. Every reached non-null node has the requested bits cleared before recursion is considered. Traversal stops below a node whose resulting flags still include JOBJ_INSTANCE; therefore an instance node remains a leaf when the mask omits JOBJ_INSTANCE, but clearing JOBJ_INSTANCE from that node immediately opens traversal into its children.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1032-L1043, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1019-L1030, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L234.

### `HSD_JObjDeleteRObj`

Detaches a specified RObj from a JObj's attached RObj list without destroying or releasing the RObj.

Consumes a JObj and an RObj identity to locate the matching node in jobj->robj. On a match, it writes the predecessor link—or jobj->robj when removing the head—to the removed node's successor, then writes NULL to the removed RObj's next field so the detached object no longer retains the list tail.

The operation is a guarded, first-match unlink: it leaves all state unchanged when either argument is NULL or when the RObj is absent from the JObj's list; when found, it removes that occurrence, clears the removed node's next link, and returns immediately.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L965-L983.

### `HSD_JObjDispAll`

Renders a JObj hierarchy for a selected transparency pass, drawing eligible ordinary nodes and recursively visiting eligible descendants while supplying special transform handling for instance nodes.

For an ordinary node, the input matrix, pass mask, and render mode flow unchanged to HSD_JObjDisp and to recursive calls over each child sibling. For a visible instance node, the function updates the instance and referenced-child matrices, computes `instance->mtx * inverse(child->mtx)`, prefixes that result with the current camera viewing matrix, and passes the resulting matrix into a recursive display of the referenced child.

A NULL root is a no-op. A JOBJ_INSTANCE node is traversed only when it is not JOBJ_HIDDEN, using the instance-specific transform path. A non-instance node is drawn only when its display-selection bits `(pass_mask << 18)` are present, and its children are traversed only when its traversal-selection bits `(pass_mask << 28)` are present.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L567-L600.

### `HSD_JObjGetCurrent`

Provides read access to the JObj subsystem's module-wide current-object slot, allowing code to retrieve the JObj most recently installed by HSD_JObjSetCurrent without receiving it as an argument.

HSD_JObjSetCurrent supplies the value by retaining the incoming JObj, releasing the previously current JObj, and assigning the incoming pointer to current_jobj; HSD_JObjGetCurrent then returns that stored pointer unchanged and performs no mutation.

Returns the stored pointer without acquiring a reference. SetCurrent replaces it with retain-before-release ordering; JObjAmnesia can also clear it directly without unreferencing when the built-in class is forgotten.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1060-L1063, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1053-L1058, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1529-L1539.

### `HSD_JObjGetDObj`

Safely retrieves the DObj attached to a JObj whose union is currently configured to hold display-object data, returning null when the JObj is absent or has a different union type.

The input JObj first feeds a null check and the union_type_dobj discriminator check. If both pass, the stored jobj->u.dobj pointer is forwarded unchanged to the caller; otherwise the output is null. The function performs no mutation.

This accessor has two guarded outcomes: null or non-DObj JObjs produce null, while a non-null JObj in DObj union mode produces its attached DObj. It does not transition the JObj or attachment state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L931-L937.

### `HSD_JObjGetFlags`

Provides null-safe read access to a JObj's complete flag word so callers can inspect the joint object's configured modes and status bits without directly dereferencing a possibly null pointer.

The caller supplies an HSD_JObj pointer; for a non-null pointer the function copies `jobj->flags` directly to its `u32` return value, while a null pointer produces zero. It performs no writes and does not transform or mask the flag word.

This query is side-effect free and has a single guard: a non-null JObj yields its current flag word, whereas a null JObj is treated as having no flags and yields zero.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L985-L991.

### `HSD_JObjGetPrev`

Finds a JObj's immediately preceding sibling in its parent's singly linked child list so hierarchy-editing operations can splice, detach, or truncate a non-first child without storing explicit backward links.

Reads the input JObj's parent pointer, the parent's child pointer, and successive sibling next pointers. It returns the first sibling whose next pointer equals the input node; callers then write through that returned sibling's next field to remove or reposition the input within the hierarchy. The function itself does not modify the tree.

Returns NULL immediately for a null node, a node without a parent, or the parent's first child. Otherwise it scans from the parent's first child until it finds the predecessor. Reaching the end without finding the supposedly parented node is treated as a broken-tree invariant and triggers HSD_Panic before the fallback NULL return.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L909-L929.

### `HSD_JObjLoadJoint`

Constructs a complete runtime HSD_JObj hierarchy from an HSD_Joint descriptor tree, then resolves references across the newly loaded hierarchy before returning its root.

Calls JObjLoadJointSub with a null parent, then resolves runtime/descriptor references and returns the result. Null descriptors yield NULL. The helper selects named metadata or the configured fallback class and ignores the virtual load return. The base loader recursively constructs child and next links except instance children, ORs flags, loads owned attachments, borrows spline/particle payloads and registers descriptor-address IDs; particle loading also sets bit 31 in borrowed list data words.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L610-L672.

### `HSD_JObjMakeMatrix`

Builds a JObj's cached world transform from its local scale, rotation, and translation, incorporating the parent transform and the JObj's scale-inheritance, rotation-representation, and optional reference-object behavior.

The function first updates the parent JObj's matrix. It derives jobj->scl either by copying the parent's accumulated scale, by multiplying local and parent scale componentwise, or from the local scale alone. It then feeds local scale, rotation, translation, and any parent accumulated scale into an Euler- or quaternion-based SRT constructor, concatenates the parent matrix to produce jobj->mtx, and, when aobj->hsd_obj references another JObj, transforms the local translation through that reference matrix and writes the result into the world matrix's translation column.

A scale-inheritance flag selects whether the node's accumulated-scale cache merely follows the parent's cache or includes the node's own componentwise scale; the inherited case removes the cache entirely when the parent has none. Flag 0x20000 selects quaternion rotation instead of the ordinary vector-rotation SRT path. A non-null parent causes hierarchical matrix concatenation, and a non-null AObj reference JObj causes a final translation override after both matrices have been set up.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L138-L196, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L63-L87.

### `HSD_JObjPrependRObj`

Attaches an HSD_RObj to a JObj by inserting it at the head of the JObj's RObj list, providing a null-safe operation for adding relation or constraint records to a joint object.

For valid inputs, the function reads the JObj's current robj head, passes that head to robj_set_next as the new RObj's successor, and writes the helper's returned RObj pointer back to jobj->robj. Thus the supplied RObj becomes the new head while the previous chain remains reachable through its next link.

The operation has two states: if either pointer is null, it returns without changing the JObj or RObj; otherwise it performs one head insertion, replacing jobj->robj with the supplied RObj after linking that RObj to the former head.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L948-L963.

### `HSD_JObjRemove`

Removes one JObj from its hierarchy, promotes its sole child into the removed node's position when present, detaches the removed node from all hierarchy links, and releases its JObj reference.

Reads the node's child, next sibling, parent, and preceding sibling to select a replacement. It writes the predecessor's next pointer or the parent's child pointer to that replacement; when a child is promoted, it inherits the removed node's next sibling and parent. The removed node's three hierarchy links are then cleared before it is unreferenced, and its former child is returned.

Null returns NULL. A non-null child must have next == NULL. Splices that sole child, or the input next sibling when childless, into the old incoming link; a promoted child inherits the old parent and next sibling. Clears all three links on the removed node, unreferences it, and returns the former child. No atomicity, cycle validation, transform preservation, dirty propagation or render-summary recalculation is provided here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L740-L771, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L716-L729, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L909-L929.

### `HSD_JObjRemoveAll`

Detaches a JObj and the entire sibling suffix beginning at that node from its parent hierarchy, isolates every removed node from the hierarchy, and releases one reference to each node.

The input JObj supplies its parent, predecessor, and following-sibling chain. If attached to a parent, the function redirects the predecessor's next link to NULL or clears the parent's child link when the input is the first child. It then saves each node's next pointer, clears that node's parent and next pointers, sends the isolated node to HSD_JObjUnref, and continues with the saved sibling.

NULL input is a no-op. For a parented node, removal first truncates the parent's child list immediately before the node; for an unparented node, no incoming hierarchy link is changed. In either case, every node from the input through the final sibling transitions to an isolated state with parent and next set to NULL before it is unreferenced.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L774-L797, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L716-L736, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1480-L1509.

### `HSD_JObjRemoveAnim`

Removes every supported animation channel attached to one HSD_JObj by invoking the flag-selective removal path with the full 0x7FF mask. This tears down the joint's own AObj and forwards removal to its attached display-object and constraint-object animation controllers without traversing child JObjs.

The input JObj pointer and constant mask 0x7FF flow into HSD_JObjRemoveAnimByFlags. For a non-NULL JObj, that helper removes and clears jobj->aobj, passes the JObj's DObj list and the same mask to HSD_DObjRemoveAnimAllByFlags when the JObj stores DObjs, and passes jobj->robj and the mask to HSD_RObjRemoveAnimAllByFlags.

A NULL JObj is a no-op through the delegated helper. For a live JObj, the operation removes all selected animation state from that node and its DObj/RObj attachments; it clears the node's AObj pointer after removal. It does not recurse into child or sibling JObjs, so descendant animation state remains intact unless the separate hierarchy-wide removal routine is used.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L226-L229, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L198-L234.

### `HSD_JObjRemoveAnimAll`

Removes all animation controllers selected by the full 0x7FF component mask from a JObj hierarchy rooted at the supplied node, including animation data attached to reached JObjs, DObjs, and RObjs.

The caller supplies a JObj hierarchy root. The wrapper augments that pointer with the constant mask 0x7FF and forwards both to HSD_JObjRemoveAnimAllByFlags. For every reached node, mask bit 0 removes and clears jobj->aobj, the same mask is forwarded to the node's DObj and RObj removal routines, and unchanged root-to-child traversal carries it through the hierarchy.

A null hierarchy root is a no-op. Otherwise, the root is stripped first and descendants are visited recursively. A node marked JOBJ_INSTANCE is still processed, but traversal stops at that node instead of entering its child list. On each reached node, the JObj AObj is removed and cleared when mask bit 0 is selected; DObj removal occurs only when the JObj union currently represents DObj data, while RObj removal is always delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L231-L234, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L198-L234.

### `HSD_JObjRemoveAnimAllByFlags`

Removes the animation components selected by a flag mask from one JObj and, unless the node is an instance boundary, recursively from every descendant in its child/sibling hierarchy.

The root JObj and selection mask first enter HSD_JObjRemoveAnimByFlags for the current node. There, mask bit 0 removes and clears the node's AObj, DObj-capable nodes forward the mask to their DObj hierarchy, and attached RObjs always receive the mask. The wrapper then propagates the same mask through each child and its next-sibling chain, except below JOBJ_INSTANCE nodes.

A null root is a no-op. Every non-null node has its own selected animation components removed before descendant traversal. If that node has JOBJ_INSTANCE set, processing stops after the node itself; otherwise all child subtrees are processed. When mask bit 0 is set, the node's AObj is destroyed and its pointer is normalized to NULL.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L212-L224, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L198-L234.

### `HSD_JObjRemoveAnimByFlags`

Selectively removes animation state attached directly to one HSD_JObj. It can destroy the joint's own AObj controller and delegates the same channel mask to attached display-object and constraint animation controllers; the hierarchy-wide remover uses it as its per-node cleanup primitive.

For a non-NULL JObj, flags bit 0 controls whether jobj->aobj is passed to HSD_AObjRemove and then cleared. If the JObj's union currently contains DObjs, jobj->u.dobj and the full flags mask flow to HSD_DObjRemoveAnimAllByFlags. The JObj's RObj list and the same mask then flow to HSD_RObjRemoveAnimAllByFlags. The function produces no return value and does not modify hierarchy links.

A NULL JObj is a no-op. On a live JObj, its own AObj is destroyed and normalized to NULL only when flags bit 0 is set; DObj cleanup occurs only when the JObj union is in DObj form, while RObj flagged cleanup is requested for every live JObj. The routine affects only the supplied node; HSD_JObjRemoveAnimAllByFlags performs recursion separately and does not descend through JOBJ_INSTANCE nodes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L198-L210, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L198-L234.

### `HSD_JObjReparent`

Moves a JObj from its current parent’s child list to a new parent while preserving the caller’s place in the old sibling traversal by returning the moved node’s former next sibling.

Reads the node’s next and parent links and the old parent’s child head. It redirects either old_parent->child or the preceding sibling’s next link around the node, recalculates the old parent’s aggregate transparency bits, clears the node’s parent and next links, and passes the detached node and requested parent to HSD_JObjAddChild. The pre-mutation next link is returned to the caller.

A null node is a no-op returning NULL. For an attached node, removal handles the first-child and interior-sibling cases separately; the interior case requires a valid previous sibling and asserts if the hierarchy is inconsistent. An already detached node skips old-parent removal but is still normalized to parent == NULL and next == NULL before attachment.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L854-L876, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L799-L852.

### `HSD_JObjReqAnim`

Requests that all selectable animation channels attached to one JObj begin or resume from a supplied frame, without traversing the JObj's child hierarchy.

The caller supplies one JObj and a starting frame. HSD_JObjReqAnim adds the constant selection mask 0x7FF and delegates to HSD_JObjReqAnimByFlags, which sends the frame to the JObj's AObj, forwards the frame and mask to its DObj list unless the JObj is a particle or spline node, and forwards them to its RObj list. No value is returned and no child or sibling pointer is followed.

A null JObj is a no-op. For a valid JObj, the full mask always requests its own AObj; particle and spline JObjs suppress the DObj request, while the RObj request is still issued. Any reached AObj is moved out of AOBJ_NO_ANIM, marked AOBJ_FIRST_PLAY, and positioned at the requested frame.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L274-L277, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L277, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L91-L105, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L121-L136.

### `HSD_JObjReqAnimAll`

Requests that an entire JObj model hierarchy begin or resume its animations from a specified frame, using the full JObj animation-component mask.

The caller supplies a JObj hierarchy root and starting frame. The function adds the constant mask 0x7FF and forwards all three values to HSD_JObjReqAnimAllByFlags; that routine sends the frame and mask to each visited node's JObj, DObj, and RObj request paths and follows child/next links through non-instanced subtrees. No value is returned.

A null hierarchy root is a no-op. Otherwise, the root receives the animation request and descendants are visited recursively unless the current JObj has JOBJ_INSTANCE set, in which case that node is processed but traversal does not enter its child list. Each reached AObj is requested at the supplied frame, which clears its no-animation state and marks it for first-play interpretation at that frame.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L269-L272, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L277, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L91-L105, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L121-L136.

### `HSD_JObjReqAnimAllByFlags`

Requests animation playback from a specified frame for one JObj and, unless that node is an instance boundary, recursively for every descendant in its child/sibling hierarchy, applying the supplied animation-selection flags at each visited node.

The root JObj, selection mask, and requested frame enter HSD_JObjReqAnimByFlags for the current node. There, flag bit 0 selects the JObj's AObj, non-particle/non-spline nodes forward the request to their DObj hierarchy, and the request is always offered to attached RObjs. The wrapper then propagates the same mask and frame through each child and its next-sibling chain, except below JOBJ_INSTANCE nodes.

A null root is a no-op. A non-null node always receives its own animation request; if it has JOBJ_INSTANCE set, traversal stops after that node, otherwise every child subtree is processed. For selected AObjs, the downstream request installs the supplied current frame, clears the stopped state, and sets first-play so the requested frame is interpreted once without frame-rate advancement before ordinary playback continues.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L255-L267, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L277, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L91-L105, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L121-L136.

### `HSD_JObjReqAnimByFlags`

Requests animation playback from a supplied frame for the selected animation components attached to one JObj, covering the joint's own animation controller, eligible display objects, and reference or constraint objects.

The caller supplies a JObj, selection mask, and frame. For a valid JObj, bit 0 routes the frame to jobj->aobj; ordinary joint nodes route the frame and full mask through jobj->u.dobj into polygon, material, and texture animation requests; and jobj->robj always receives the frame and full mask. The routine itself returns no value.

A null JObj is a no-op. For a valid JObj, flag bit 0 gates the request to the joint's own AObj; JOBJ_PTCL or JOBJ_SPLINE suppresses DObj processing because the union does not represent a DObj for those node classes; RObj processing is attempted regardless. When the AObj channel is selected and present, the downstream request installs the supplied current frame, clears AOBJ_NO_ANIM, sets AOBJ_FIRST_PLAY, and synchronizes its FObj channels to that frame.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L253, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L277, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L91-L105, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L121-L136.

### `HSD_JObjResetRST`

Restores the local rotation, scale, and translation of a runtime JObj hierarchy from the corresponding HSD_Joint descriptor hierarchy, while treating instance JObjs as subtree boundaries.

For each paired node, copies descriptor rotation x/y/z, scale and position into runtime fields while leaving Quaternion w untouched. Walks child lists in parallel unless the runtime node is an instance. Missing descriptors leave corresponding runtime subtrees unchanged. The per-node reset invokes dirty handling when MTX_INDEP_SRT is clear; ordinary setup still excludes USER_DEF_MTX.

If either root pointer is null, the operation is a no-op. Otherwise the current JObj is reset before traversal; descendants are visited only when the current node lacks `JOBJ_INSTANCE`. If the descriptor hierarchy runs out before the runtime child list, subsequent recursive calls receive a null HSD_Joint and leave those JObj subtrees unchanged. Nodes with `JOBJ_MTX_INDEP_SRT` receive the copied local transform without being marked matrix-dirty by the per-node reset.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L72-L87, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L57-L70, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L259-L264.

### `HSD_JObjResolveRefs`

Performs the per-node post-load reference-fixup pass for a runtime HSD_JObj, pairing it with its source HSD_Joint descriptor and resolving references held by attached RObjs and DObjs as well as the shared child hierarchy used by an instance JObj.

Consumes a loaded HSD_JObj and its original HSD_Joint descriptor. It passes `jobj->robj` with `joint->robjdesc` to the RObj resolver; for an instance, it releases the current child, looks up `joint->child` in the HSD ID table, stores and references the resulting HSD_JObj; and when the JObj's union contains DObjs, it passes that runtime DObj list with `joint->u.dobjdesc` to the DObj resolver. All results are written into the runtime object graph in place.

A null runtime JObj or null descriptor makes the operation a no-op. Otherwise RObj references are always processed; instance JObjs replace their child with the ID-table result and assert if that identifier cannot be resolved, while non-instance JObjs leave their child unchanged in this routine; DObj references are processed only when the JObj union is in its DObj form. During hierarchy-wide resolution, non-instance children are visited recursively, whereas an instance's resolved shared child is not traversed again.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L682-L700.

### `HSD_JObjResolveRefsAll`

Performs the hierarchy-wide post-load reference-fixup pass for a newly constructed JObj tree, pairing runtime HSD_JObj nodes with their source HSD_Joint descriptors and resolving each node's relation-object, instance-child, and display-object references into live runtime objects.

Consumes a loaded HSD_JObj hierarchy alongside the HSD_Joint descriptor hierarchy that produced it. For each paired sibling, it passes the runtime node and descriptor to HSD_JObjResolveRefs, which resolves the node's RObj references, replaces an instance node's provisional child reference through the HSD ID table while updating reference ownership, and resolves DObj references when the JObj union contains DObjs. Non-instance child/descriptor pairs are then processed recursively before both sibling cursors advance. The runtime hierarchy and its attachments are mutated in place, and no value is returned.

Traversal continues only while both the current runtime JObj and descriptor Joint are non-null, so a null root is a no-op and an unmatched sibling suffix is left unprocessed. Every paired node receives per-node reference resolution. Ordinary nodes recurse into corresponding child hierarchies, whereas JOBJ_INSTANCE nodes do not recurse: their child is instead treated as a serialized shared-hierarchy reference, released, resolved through the ID table, asserted non-null, and referenced.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L702-L714, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L667-L700.

### `HSD_JObjSetCurrent`

Sets the JObj retained as the current rendering context, releasing the previously current JObj so display code can expose the joint whose attached display objects are being drawn.

The input HSD_JObj pointer is retained, the previous current_jobj is released, and the input is written to current_jobj; HSD_JObjGetCurrent subsequently returns that stored pointer. Rendering supplies the JObj before dispatching its DObj display methods and supplies NULL when those methods finish.

Transitions a single global current-JObj slot using retained ownership. Replacement retains the incoming JObj before releasing the outgoing one, and passing NULL ends the current-JObj scope; releasing the old value may run JObj child-release and deletion logic when its reference counts expire.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1053-L1058, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L711-L721, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L118, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L278-L307.

### `HSD_JObjSetDPtclCallback`

Registers the process-global dynamic-particle callback used when JObj animation evaluation encounters a particle event, allowing the game-specific effect library to handle particle spawning without coupling the generic JObj subsystem directly to that library.

The input callback is written to the static dptcl_callback slot. When JObj animation event type 0x28 is evaluated, its integer value is decoded into a six-bit bank and a 24-bit graphics-effect ID, then passed with link number 0 and the event's JObj to the registered callback. The effect library's installed callback routes bank 0x1E to the stage-effect handler and all other banks to the particle-effect spawner, marking the request as dynamic.

Each call unconditionally replaces the single global dynamic-particle handler, including permitting NULL to disable dispatch. Particle animation events invoke the handler only while the slot is non-NULL; otherwise the event is ignored.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1461-L1464, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L470-L477, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L178-L180, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1005-L1014.

### `HSD_JObjSetDefaultClass`

Configures the fallback runtime class used when allocating JObjs, allowing a subsystem to substitute a JObj-derived class for ordinary descriptor loads and to restore the built-in HSD JObj class by passing NULL.

The input class pointer is written to the translation unit's default_class slot. HSD_JObjAlloc later reads that slot as the class passed to hsdNew, falling back to the base JObj class when it is NULL; JObj loading invokes that allocator only when the joint descriptor does not resolve an explicit class.

Calling the function with a valid derived class installs a persistent process-wide JObj allocation override; calling it with NULL clears the override. Fighter-parts loading uses this as a scoped override by installing ftIntpJObj, loading a joint, and immediately clearing the setting.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L602-L608, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L610-L627, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1045-L1051, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L62-L78, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L500-L506.

### `HSD_JObjSetFlags`

ORs caller-selected bits into one JObj. Before the OR, a mismatch between the old classical-scale bit and that bit in the supplied mask requests dirty propagation when the helper predicate is false. This can request propagation even when the OR leaves an already-set scale bit unchanged.

For non-null input, compares the old JOBJ_CLASSICAL_SCALE bit with that bit in the supplied mask. On mismatch, calls HSD_JObjSetMtxDirtySub only if HSD_JObjMtxIsDirty is false. That predicate excludes USER_DEF_MTX even when the raw dirty bit is set. Finally ORs the requested mask into flags.

Null is ignored. Tests (old_flags XOR input_mask) & JOBJ_CLASSICAL_SCALE before applying the mask. If nonzero and HSD_JObjMtxIsDirty is false, calls SetMtxDirtySub. USER_DEF_MTX makes this predicate false regardless of the raw dirty bit. Then ORs the mask into flags. Both a clear scale bit being set and an already-set scale bit omitted from the mask pass the XOR test; only the first changes that bit.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L993-L1004, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L234, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1445-L1459.

### `HSD_JObjSetFlagsAll`

Applies a set of JObj flags to a root joint and its recursively reachable descendants, treating instance joints as traversal leaves. This provides a subtree-wide operation for properties such as JObj visibility.

Consumes a nullable root HSD_JObj and a u32 flag mask. For each reached node, HSD_JObjSetFlags ORs the mask into `jobj->flags`; the routine then reads the updated instance flag and, when the node is not an instance, follows `child` and `next` links and passes the same mask recursively. HSD_JObjSetFlags can additionally invalidate cached matrices through HSD_JObjSetMtxDirtySub when the node's current and requested JOBJ_CLASSICAL_SCALE bits differ.

A null root is a no-op. Every non-null node reached has its requested flags set before traversal is considered. Recursion continues through all children only while the current node's resulting flags do not include JOBJ_INSTANCE; consequently, an existing instance node is updated but its descendants are skipped, and setting JOBJ_INSTANCE in the supplied mask makes the current node a traversal boundary immediately.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1006-L1017, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L993-L1004, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L234.

### `HSD_JObjSetMtxDirtySub`

Sets a JObj raw matrix-dirty bit and propagates it through selected dependent descendants. Instance and parent-independence checks bound descent; the dirty predicate also suppresses descent through ordinary already-dirty children. User-defined matrices are excluded from the ordinary setup predicate.

Writes flag 0x40 on the input, then walks child/next links for non-instance nodes. Each child lacking MTX_INDEP_PARENT is recursively processed only when HSD_JObjMtxIsDirty returns false; that helper checks both USER_DEF_MTX and the raw dirty bit.

Sets the input raw MTX_DIRTY bit without a null guard. Descends unless the input is an instance. Skips parent-independent children and children whose HSD_JObjMtxIsDirty predicate is true. Because that predicate excludes USER_DEF_MTX, user-defined children may be revisited even with their raw bit already set. An ordinary already-dirty child suppresses traversal through its whole subtree.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1445-L1459, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L234.

### `HSD_JObjSetupMatrixSub`

Rebuilds a dirty JObj's cached transform matrix and applies the post-build behavior required by its joint kind, including specialized inverse-kinematics resolution, effector placement from an IK hint, or ordinary RObj constraint updates.

The function receives a dirty JObj, invokes its class-specific make_mtx method, and writes the resulting cached matrix. Joint1 and Joint2 nodes pass to dedicated IK resolvers; an effector reads its parent's translation and normalized X axis plus the parent's optional X scale and IK-hint bone length to compute its own translation; an ordinary node passes attached RObjs through JObjUpdateFunc and rebuilds if that processing dirties the matrix.

The guarded public setup operation enters this subroutine only for a non-null dirty JObj. The subroutine builds once and clears JOBJ_MTX_DIRTY; user-defined matrices bypass all automatic joint and constraint post-processing. Otherwise Joint1, Joint2, Effector, and ordinary nodes take distinct paths. Ordinary RObj processing can reassert dirtiness and cause one additional build, and every completed automatic path leaves the matrix clean.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1385-L1443, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L256.

### `HSD_JObjUnref`

Processes primary-reference release. A primary count decrement from zero, or an already-present 0xFFFF sentinel, enters teardown. Zero internal references cause immediate deletion; otherwise a temporary internal reference surrounds virtual release_child and a final internal-count check decides deletion. This is not limited to the first transition to the sentinel.

The input JObj flows first into ref_DEC. If that decrement does not trigger release, the function produces no further effect. Otherwise its internal-reference count selects immediate deletion or deferred teardown; the deferred path increments the internal count, passes the JObj to its virtual release_child method, decrements the temporary internal reference, and forwards the JObj to hsdDelete only when the resulting count allows deletion.

Null is ignored. ref_DEC returns true when the u16 primary count is already 0xFFFF, or when post-decrementing zero to 0xFFFF; otherwise it only decrements. On a true result, zero internal references cause immediate deletion. With internal references, temporarily increments that counter, calls virtual release_child, decrements the temporary reference, and deletes only if that decrement reports zero. Repeated primary release at the sentinel can re-enter this teardown path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L716-L729, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L11-L11, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L118, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1480-L1527.

### `HSD_JObjUnrefThis`

Processes internal-reference release and deletes only if the internal count is zero afterward and the primary count is the 0xFFFF sentinel. An already-zero internal count also meets the terminal condition without a decrement; the caller pointer is not cleared.

For non-null input, calls iref_DEC and, if it reports zero, checks ref_CNT < 0 before deleting. iref_DEC also reports success when the internal count was already zero and leaves it zero; ref_CNT maps primary raw 0xFFFF to -1. The caller pointer is not cleared.

Null is ignored. Internal count zero reports the terminal condition without decrementing; otherwise the u16 count decreases by one and reports whether it reached zero. Deletes only when that condition coincides with primary raw count 0xFFFF. No underflow assertion rejects an already-zero internal release.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L731-L736, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L118.

### `HSD_JObjWalkTree`

Performs a pre-order walk of a JObj hierarchy, invoking a caller-supplied callback once for the root and each traversable descendant while identifying whether each visited node is the root, its parent's first child, or a later sibling.

The supplied root begins the traversal and is delivered directly to the callback with tag 0. For every non-instance node, its `child` pointer starts an ordered sibling-list scan through `next`; each child subtree is passed to HSD_JObjWalkTree0, which forwards the same callback and `cb_args` and derives the node's structural tag from its parent linkage. The traversal itself does not modify JObj fields, although the callback may act on each visited node.

A NULL root is a no-op. A NULL callback suppresses visits but does not suppress hierarchy traversal. Each node is processed before its descendants; children are visited in `next`-list order. A node carrying `JOBJ_INSTANCE` is treated as a traversal leaf, so its child hierarchy is not entered.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L111-L127, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L89-L109, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L155-L156, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L220-L235, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L250-L283.

### `HSD_JObjWalkTree0`

Performs the recursive descendant portion of a JObj tree walk, visiting each non-root node in preorder and optionally invoking a caller-supplied callback with a classification indicating whether that node is its parent's first child or a later sibling.

Consumes the current JObj's parent, flags, child, and sibling links. It forwards the same callback and `cb_args` bundle unchanged to every recursively visited descendant, while passing each callback the current node and a classification derived from whether that node equals `parent->child`; observable output is produced only through callback side effects.

Returns immediately for a null node and requires every non-null node handled by this helper to have a parent. It invokes a non-null callback before visiting descendants, and it prunes recursion below nodes marked `JOBJ_INSTANCE`; otherwise it walks all children from `child` through the null-terminated `next` chain.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L89-L109, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L155-L156.

### `JObjAmnesia`

Handles HSD class-amnesia notifications for the JObj subsystem by discarding JObj-global references associated with the forgotten class and then delegating the same notification to the parent object class.

The incoming HSD_ClassInfo pointer is compared by identity with the configured JObj default class and the built-in hsdJObj class. A default-class match writes NULL to `default_class`; a built-in-class match writes NULL to `ufc_callbacks` and `current_jobj`; the original pointer is then passed unchanged to the parent class's amnesia callback.

Cleanup is selective and compositional: forgetting the configured default class invalidates only that allocation-class override, while forgetting the built-in JObj class also invalidates the JObj callback and current-object globals. The two guards are independent, and parent-class amnesia processing runs on every invocation. Unlike normal HSD_JObjSetCurrent replacement, clearing `current_jobj` here is a direct invalidation with no reference-count update.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1529-L1539.

### `JObjAnimAll`

Recursively evaluates animation for one HSD_JObj and its non-instanced descendant hierarchy. It performs the complete per-node joint, constraint-object, and display-object animation update before descending through that node's child and sibling chains.

Consumes a nullable root JObj. Each visited node flows into HSD_JObjAnim, which checks transform dependencies, interprets the node's AObj using JObjUpdateFunc, advances attached RObjs, and advances attached DObjs when the node uses the DObj union arm. Unless the node is an instance boundary, its child pointer seeds recursive processing and each child's next pointer supplies the following sibling; the helper returns no value.

A null root is a no-op. Traversal is pre-order: a non-null JObj is animated before any descendants. A JOBJ_INSTANCE node is still animated itself, but its child hierarchy is not traversed; otherwise all child subtrees are processed in next-sibling order.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L543-L556, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L531-L541, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L558-L565.

### `JObjInfoInit`

Bootstraps the HSD JObj runtime class as a subclass of HSD Obj, then installs the JObj-specific lifecycle, matrix-construction, display, descriptor-loading, and child-release virtual methods used by generic HSD object dispatch.

Reads the global hsdObj class descriptor as the parent definition and writes the global hsdJObj class descriptor: first supplying its library/class identifiers and metadata and instance sizes to hsdInitClassInfo, then storing JObj-specific function pointers into its base-class and extended JObj method slots.

At runtime, the routine turns the bootstrap hsdJObj class record into fully configured JObj class metadata: it establishes inheritance and size information before installing the lifecycle and JObj operation dispatch callbacks.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1558-L1571.

### `JObjInit`

Initializes a newly allocated HSD JObj instance through the HSD class hierarchy, then establishes the JObj-specific default transform state: an invalid cached matrix and identity scale.

Passes the incoming object to the parent class initializer and uses its returned status as the guard and initial result. On success, it writes JOBJ_MTX_DIRTY to the object's flags and 1.0 to each scale component, normalizes the return value to zero, and returns it; on failure, it returns the parent's negative status without performing the JObj-specific writes.

Successful initialization places the JObj in a matrix-invalidated state with identity scale, ensuring its cached matrix must be built from neutral scale before use. If parent initialization fails, the function does not enter this initialized JObj state and propagates the failure.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1466-L1478.

### `JObjLoad`

Populates an already allocated runtime HSD_JObj from an HSD_Joint descriptor as the base JObj class's load callback, recursively materializing the descriptor's applicable child and sibling hierarchy and attaching its rendering, constraint, transform, matrix, and identifier data.

Recursively loads non-instance children and all next siblings before assigning parent and ORing descriptor flags. Borrows spline or particle-list storage; particle loading mutates each borrowed list data word by setting bit 31. Otherwise loads DObjs. Loads RObjs, copies rotation x/y/z, scale and translation, initializes the matrix to identity, clears scl, optionally allocates/copies envelopemtx, then registers the descriptor address as this object id. It does not copy a complete Quaternion or return-check recursive virtual loaders.

Loading is mode-dependent. A JOBJ_INSTANCE descriptor suppresses recursive loading of its child descriptor, while its next sibling is still loaded. After flags are merged, spline-mode JObjs retain the descriptor's spline pointer, particle-mode JObjs retain its list and set bit 31 in every list element's data word, and ordinary JObjs load a DObj chain. All modes load RObjs and local transforms; envelope-matrix storage is allocated only when the descriptor supplies a matrix.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L629-L665, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L610-L627, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L682-L714.

### `JObjRelease`

Performs the release phase of an HSD JObj: it delegates hierarchy and attachment cleanup through the JObj class method, unregisters the object from the ID table when it is the current entry for its ID, frees optional scale and envelope-matrix allocations, and then invokes the parent-class release routine.

Consumes the releasing JObj's class methods, ID, hierarchy and attachment pointers, optional scale-vector pointer, and optional envelope-matrix pointer. The child-release method clears owned hierarchy and attachment links; JObjRelease removes the matching ID-table entry, returns the optional vector and matrix allocations to their allocators, and passes the original base-class pointer to the superclass release routine.

Release is ordered so structural ownership is dismantled before object-local storage and base-class state: children and attachments are released first, the ID-table entry is removed only if it still maps the JObj's ID to this exact object, optional scale and envelope-matrix allocations are freed only when non-null, and superclass release runs last.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1511-L1527.

### `JObjReleaseChild`

Performs the relationship-and-attachment teardown stage of an HSD JObj's virtual release path: it releases or destroys the child hierarchy according to its ownership mode, detaches the JObj from its parent, and removes its attached display, constraint, and animation objects before the outer release routine disposes of the JObj's remaining local resources.

Consumes the JObj's child, parent, flags, union-selected DObj list, RObj list, and AObj pointer. An instance child flows to HSD_JObjUnref, while an owned child hierarchy flows to HSD_JObjRemoveAll after its root parent pointer is cleared; the JObj itself flows through HSD_JObjReparent when attached to a parent. Present DObj, RObj, and AObj attachments flow to their respective removal routines, and every released attachment field is then set to NULL.

Teardown distinguishes shared instance hierarchies from owned hierarchies: a JOBJ_INSTANCE releases only its reference to the child, whereas a non-instance severs the child's parent link and removes the complete child hierarchy. It then detaches the JObj from any parent and conditionally removes DObjs only when the JObj union currently represents DObj storage, followed by all RObjs and the AObj. Each successfully handled relationship or attachment is normalized to NULL before control returns to the outer JObj release path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1480-L1509.

### `JObjResetRST`

Restores one runtime JObj's local rotation, scale, and translation from its corresponding HSD_Joint descriptor and invalidates the cached transform matrix when that matrix depends on the restored SRT values.

Copies descriptor rotation x/y/z, scale and position into runtime fields; rotate.w is untouched. When MTX_INDEP_SRT is clear, invokes the dirty macro. Its USER_DEF_MTX-aware predicate controls propagation, so setting a raw dirty bit does not guarantee an ordinary setup rebuild.

Null input or descriptor is ignored. Copies descriptor rotation x/y/z, scale and position; the Quaternion w component is untouched. If MTX_INDEP_SRT is clear, invokes the dirty macro, which checks the USER_DEF_MTX-aware dirty predicate before propagating. It does not validate rotation representation or copy a complete quaternion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L57-L70, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L115-L117, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L259-L264.

### `JObjSortAnim`

Moves the first FObj whose obj_type equals TYPE_JOBJ, numeric 12, to the front of an AObj list. In the JObj update callback, numeric 12 is HSD_A_J_BRANCH, controlling subtree visibility. This is a first-match promotion, not a general transform-channel sort.

Reads an AObj's fobj head and each FObj's obj_type and next link. A pointer-to-pointer cursor identifies the incoming link of the first TYPE_JOBJ node; the function redirects that link to the selected node's successor, points the selected node at the former list head, and stores the selected node as the new aobj->fobj head.

A null AObj or an AObj with no FObjs is a no-op. Otherwise the function stops after the first TYPE_JOBJ FObj: if none exists the list remains unchanged, while a found node becomes the head and all other nodes retain their prior relative order. Selecting an already-leading TYPE_JOBJ leaves the effective list order unchanged.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L279-L296, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.h#L29-L40, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L387-L387, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L420-L426, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L298-L308.

### `JObjUpdateFunc`

Applies one interpreted JObj animation channel to a joint. Depending on the channel, it updates path-derived position, rotation, translation, scale, node or subtree visibility, custom user channels, particle or sound events, raw matrix columns, or local transform components recovered from the joint's matrix.

Receives a channel type and interpreted HSD_ObjData value from a JObj's AObj evaluation. It routes scalar channels through JObj transform setters, maps a normalized path parameter through the spline referenced by the AObj's HSD object, mirrors joint-1 X rotation into an IK-hint RObj when present, propagates visibility changes either to one node or its subtree, forwards custom and event channels to registered callbacks, and either writes matrix columns directly or converts the current world matrix into parent-relative translation, rotation, and scale.

A NULL JObj makes the callback a no-op. Path parameters are clamped to [0, 1] before spline evaluation; scale channels whose absolute value is below 0.001 are replaced with positive 0.001; branch and node visibility channels clear JOBJ_HIDDEN only when their value is greater than 0.5 and set it otherwise. Event channels invoke callbacks only when the corresponding registry or callback pointer exists. Matrix-decomposition channels selectively recover translation, rotation, scale, or combinations of them according to channel types 0x36 through 0x39.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L349-L529, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L21-L54, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L295-L342, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L400-L450, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L511-L563.

### `RecalcParentTrspBits`

Repairs cached render-pass summary flags after a JObj hierarchy loses or moves children, clearing opaque, translucent, or texture-edge subtree bits that are no longer represented by the node's remaining children.

For each visited JObj, the routine scans child->next and combines each child's existing subtree summary bits with the child's direct render-pass bits shifted into the JOBJ_ROOT_MASK positions. It preserves every non-root flag, intersects the JObj's old root flags with the combined child-derived mask, and therefore only clears stale summary bits; additions are handled separately by UpdateParentTrspBits.

Insertion propagates new render-summary bits through parent links. HSD_JObjReparent invokes this removal-side recalculation on the old parent, but HSD_JObjRemove and HSD_JObjRemoveAll do not. Recalculation follows next links while it clears unsupported bits and stops at the first unchanged node; it does not ascend ancestors.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L799-L814, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L567-L600, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L816-L826.

### `resolveIKJoint1`

Solves a Joint1 JObj's articulated orientation toward its effector target. It derives a bend plane and two-bone solution from IK hints and reference positions, then replaces the joint's matrix axes and anchors its translation at the parent joint's position.

Reads Joint1 scale and IK hint, optional Joint2 length and bend flag, effector reference position, optional bend reference and parent translation. In the nondegenerate branch it computes cross-product axes with epsilon-regularized normalization and two-segment geometry, then writes scaled axes and the parent origin. Collinear axes need not form an orthonormal basis, and near-zero target distance leaves scalar and vector temporaries uninitialized before later use.

Requires Joint1 IK hint and, when Joint2 exists, its hint. The effector search asserts if no effector-kind node exists; it returns NULL if that node lacks a subtype-1 JObj reference, skipping the solution. A target squared distance greater than 1e-8 initializes the bend basis and two-segment geometry. When the comparison is false, including equality or NaN, var_f27, var_f28, sp74 and sp80 remain uninitialized but are later consumed; there is no proven valid straight fallback. Negative geometric height is clamped to zero in the nondegenerate branch. Joint2 hint mask 0x4 reverses bend side.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1102-L1252, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1065-L1098.

### `resolveIKJoint2`

Builds the second IK joint matrix from the parent hinted bone endpoint and the effector translate field. It optionally clamps a signed angle, derives axes using cross products and epsilon-regularized normalization, and stores scaled axes plus the endpoint translation. Degenerate inputs do not guarantee a valid orthonormal basis.

The function obtains an effector from `jobj->child`; reads the parent matrix's translation, X axis, and Z axis; reads the parent's optional X scale and required IK-hint bone length; and reads the current joint's optional scale, IK hint, and lower/upper angular-limit RObjs. These inputs produce a bone-end origin and normalized effector direction. If that direction violates a configured signed-angle limit, it is replaced by the parent's normalized X axis rotated around the parent's Z axis by the clamped angle. Cross products then produce the other two axes, and the three axes and origin are written to `jobj->mtx`.

Effector search asserts if no effector-kind child exists; it returns NULL if that effector lacks a subtype-1 JObj reference. Returns when that result is NULL or parent is absent. Parent IK hint is mandatory. Optional subtype-5/6 limits and the current hint mask 0x4 determine signed-angle clamping. Reads the effector translate field already prepared by prior work; it does not obtain its global position itself. Degenerate axes are only epsilon-regularized, not guaranteed orthonormal.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1257-L1383, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1065-L1098.

### `TU`

Implements the HSD JObj scene-graph subsystem: constructing hierarchical runtime joint objects from descriptors, maintaining their transforms and cached matrices, displaying and animating attached render objects, and managing hierarchy-wide transform invalidation.

JObj local transform state, hierarchy links, joint-mode flags, and attached RObj constraints feed the unit's cached matrix calculations. Matrix invalidation propagates from a changed JObj to dependent children, while matrix setup consumes parent matrices, parent scale, IK hints, and bone lengths to update each affected JObj's cached matrix.

Ordinary matrix setup rebuilds only when USER_DEF_MTX is clear and the raw dirty bit is set. Setup clears that bit after construction; ordinary RObj updates can request one additional build. Dirty propagation marks its input, stops descent at instances, skips parent-independent children, and skips entire subtrees rooted at ordinary already-dirty children. User-defined children may be revisited despite an already-set raw bit.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L236-L347, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L531-L714, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1385-L1571.

## Header and Traversal Boundaries

The header defines a 0x88-byte runtime JObj with HSD_Obj base, parent/child/next links, flags, DObj/particle/spline union, Quaternion rotation, scale and translation, cached world matrix, accumulated-scale pointer, envelope matrix, AObj/RObj attachments and descriptor-address ID. The descriptor has only three rotation components. The class table dispatches load, matrix construction, position matrix, display and child release.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L63-L156.

Most All operations process one supplied node and its child subtrees, stopping child descent at instances. They do not automatically process the root next-sibling suffix. ResolveRefsAll and descriptor loading explicitly traverse root next links, and RemoveAll removes a suffix. SetFlagsAll and ClearFlagsAll test the instance bit after mutation, so the input mask changes traversal eligibility immediately. Callbacks run before child traversal and can affect later reads; this is not a snapshot-safe walk.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L72-L127, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L323-L347, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L543-L600, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L629-L714, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L774-L797, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L993-L1043.

## Header Transform Helpers

Child, next and parent accessors tolerate NULL; RObj and transform accessors assert required pointers. HSD_JObjMtxIsDirty excludes USER_DEF_MTX. HSD_JObjSetupMatrix returns for NULL or false dirty predicate. Transform setters write first and request dirty propagation unless MTX_INDEP_SRT is set. Rotation-component setters assert non-quaternion mode, while additive rotation helpers do not make that representation check. WithMtxDirty variants call the out-of-line symbol; the normal variants use the macro. Scale setters themselves have no near-zero clamp; the animation callback applies that clamp. CopyMtx copies the supplied matrix into jobj->mtx without setting or clearing flags. GetMtxPtr attempts setup before exposing the internal matrix. GetTranslation2 omits the output-pointer assertion present in GetTranslation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L192-L272, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L274-L478, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L479-L721.

## Input and Ownership Limits

Unref uses a u16 ordinary count with 0xFFFF as no-reference sentinel and a separate zero-based internal-reference count. Primary decrement at the sentinel and internal decrement at zero report release conditions without changing storage. Instance children are referenced shared nodes; ordinary children are detached and unreferenced during release. Borrowed spline/particle payloads are not freed by the DObj-only release branch. Class amnesia nulls current_jobj and callback-list state directly and leaves the three event callbacks intact.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L60-L118, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L629-L700, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L716-L736, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1480-L1539.

JObjUpdateFunc clamps path input and mutates val->fv. Tiny negative scales become positive 0.001. SETBYTE channels pass val->iv through a callback typedef whose last formal is f32, so the signed integer is numerically converted to float. Matrix-column and decomposition channels write fields directly without normal setter dirty propagation. Rotation-X hint update tests the JOINT1 bit, which also occurs within EFFECTOR; it is not an equality test of the role field.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L349-L529 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L80-L87.

## Existing Objects

object-src.txt and object-obj.txt record hashes and section evidence. Source/target extents are .data 980/984, .rodata 36/40, .sdata 53/56, .sbss 24/24, .sdata2 80/80 bytes. Target padding does not establish new semantic objects. The three .rodata vectors contradict the inherited diagnostic-string description. The .sdata literals differ from the inherited root-text/zero-block description; those objects are in .data. Object build provenance remains unverified.

## Review State

All 158 subjects, 277 facts and 27 outgoing baseline links have explicit records. Six game-specific example facts remain unresolved, with no proposed writes. Every proposed correction requires independent review before shared-KB application.

Lead relationship gate: 24 retained, 2 rejected, 1 unresolved. The rejected rationales concern branch visibility versus transform sorting and the unfiltered request wrapper versus the actual recursive callee. The unresolved rationale includes unverified gameplay callers. Original records remain unchanged.
