# lb_00B0 Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reviewed 3 owned files in canonical and rendered views, 887 lines, 42 functions, 3 data targets, 89 entities and all 222 inherited facts. The 88 parameter entities have no inherited facts and are explicitly reviewed_empty.

Fact dispositions: {'unresolved': 49, 'retain': 100, 'supersede': 71, 'clear': 2}. Proposal operations: 73, including 2 inferred-name clears.

## Behavior and Limits

### lb_8000B074

Tests attached AObj presence and AOBJ_NO_ANIM clear. The JObj must be nonnull; no state is changed.

### lb_8000B09C

Searches for an attached AObj with AOBJ_NO_ANIM clear through child, next and parent links. Null input returns false. Traversal may leave the supplied subtree; an INSTANCE node ascends through parents and bypasses its own next link. No object state is changed.

### lb_8000B134

Searches for an attached AObj with AOBJ_REWINDED set through child, next and parent links. Null input returns false. Traversal may leave the supplied subtree; an INSTANCE node ascends through parents and bypasses its own next link. No object state is changed.

### lb_8000B1CC

Transforms a local point using a JObj. Null JObj copies the required input point. Parented JObjs refresh the matrix; null or zero points return its translation column. Root null or zero points return local translation; zero XYZ rotation and unit scale add translation directly, ignoring rotate.w and quaternion mode in that test. Other inputs use matrix multiplication. Matrix setup can update cached state.

### lb_8000B4FC

Copies one Joint rotation, scale and position to one JObj, clears quaternion mode, and calls matrix dirtying unless MTX_INDEP_SRT is set. Either null input is a no-op. It does not traverse either hierarchy.

### lb_8000B5DC

Copies one Joint rotation and position to one JObj while preserving scale, clears quaternion mode, and calls matrix dirtying unless MTX_INDEP_SRT is set. Either null input is a no-op.

### lb_8000B6A4

Copies one Joint scale and position to one JObj while preserving rotation, and calls matrix dirtying unless MTX_INDEP_SRT is set. Either null input is a no-op.

### lb_8000B760

Copies one Joint position to one JObj while preserving rotation and scale, and calls matrix dirtying unless MTX_INDEP_SRT is set. Either null input is a no-op.

### lb_8000B804

Recursively copies Joint rotation, scale and position into paired JObjs, clears quaternion mode and sets matrix dirty unconditionally. It visits matching next links before child links. A null member ends that paired branch; INSTANCE does not exclude recursion.

### lb_8000B9D8

For a nonzero walker tag, passes jobj->aobj and the rate read through float** to HSD_AObjSetRate. Tag zero is ignored. The canonical walker tags root zero, first child one and later sibling two, so the root rate is unchanged.

### lb_8000BA0C

Passes a pointer to the rate pointer through HSD_JObjWalkTree to lb_8000B9D8. Canonical traversal skips the root rate, visits descendants before their children, and does not descend through INSTANCE nodes. Null root is a no-op. Only attached AObj framerate fields change.

### lbDObjSetRateAll

For one DObj, forwards rate to shape-animation PObj AObjs, its material AObj and texture AObjs. Null DObj or missing attachments are skipped. It follows PObj and TObj next links, never dobj->next. HSD_AObjSetRate changes only nonnull AObj framerate fields.

### lbDObjReqAnimAll

For one DObj, requests a frame on shape-animation PObj AObjs, its material AObj and texture AObjs. It follows PObj and TObj next links, never dobj->next; missing attachments are skipped. HSD_AObjReqAnim writes curr_frame, clears NO_ANIM, sets FIRST_PLAY and forwards the request to the FObj chain.

### lbFindJObjWithAObj

Returns the first nonnull JObj with an AObj in current, child, next recursive order, or null. This includes the supplied node's sibling chain and does not exclude INSTANCE children.

### lbGetJObjFramerate

Returns framerate from the first AObj-bearing JObj found in current, child, next order, or zero if absent. No animation state changes.

### lbGetJObjCurrFrame

Returns curr_frame from the first AObj-bearing JObj found in current, child, next order, or zero if absent. No animation state changes.

### lbGetJObjEndFrame

Returns end_frame from the first AObj-bearing JObj found in current, child, next order, or zero if absent. No animation state changes.

### lb_8000BECC

Returns the first AnimJoint with an aobjdesc in current, child, next recursive order, or null. The supplied node's sibling chain is included.

### lb_8000BFF0

Returns end_frame from the first descriptor-bearing AnimJoint found in current, child, next order, or zero if absent. No animation state changes.

### lb_8000C07C

Indexes each independently optional animation, material-animation and shape-animation table at the supplied signed index. Absent tables contribute null; present tables have no bounds check. Passes the three selected descriptors to HSD_JObjAddAnimAll once.

### lb_8000C0E8

Reads DynamicModelDesc animation, material-animation and shape-animation tables and delegates the supplied JObj and index to lb_8000C07C. Descriptor must be nonnull; optional tables and unchecked indexing follow that helper.

### memzero

Writes zero bytes while decrementing a signed ssize_t count. Zero size writes nothing; positive size clears that many bytes of caller-owned writable memory. Negative size does not safely terminate and leads to invalid writes or signed-overflow undefined behavior.

### lb_8000C1C0

Allocates an RObj, ORs flags with 0x90000001, passes the second JObj to HSD_RObjSetConstraintObj, then prepends via HSD_JObjPrependRObj. Subtype resolution and reference-management behavior are delegated.

### lb_8000C228

Allocates an RObj, ORs flags with 0x90000002, passes the second JObj to HSD_RObjSetConstraintObj, then prepends via HSD_JObjPrependRObj. Subtype resolution and reference-management behavior are delegated.

### lb_8000C290

Allocates an RObj, ORs flags with 0x90000004, passes the second JObj to HSD_RObjSetConstraintObj, then prepends via HSD_JObjPrependRObj. Subtype resolution and reference-management behavior are delegated.

### lb_8000C2F8

Calls subtype-1 constructor lb_8000C1C0 then subtype-4 constructor lb_8000C290 with the same destination and constraint JObjs. The wrapper itself does not copy transforms or replace previous relation records.

### lb_8000C390

Repeatedly finds enabled REFTYPE_JOBJ relations with wildcard subtype zero, saves each successor, calls HSD_JObjDeleteRObj then HSD_RObjRemove, and resumes from the saved successor. Disabled records and other relation types are skipped by canonical HSD_RObjGetByType.

### lb_8000C420

Allocates an RObj, ORs the caller flags with 0xA0000000, stores the scalar into u.limit when the RObj is nonnull, and calls HSD_JObjPrependRObj. It does not mask the caller flags or search for an existing bound.

### lb_8000C490

Combines two JObj translations and scales using both caller weights without normalization. Nearly equal Euler XYZ components within 1e-4 copy the first rotation and clear quaternion mode. Otherwise converts Euler inputs, negates the second quaternion when squared difference exceeds squared sum, and calls HSD_QuatLib_8037EF28 with the second weight alone. Sets quaternion mode on that path and marks the destination matrix dirty on both paths.

### lbCopyJObjSRT

Copies one JObj rotation, scale and translation into another, copies quaternion-mode selection, and marks the destination matrix dirty. Both pointers are required; no hierarchy traversal occurs.

### lb_8000C868

Combines Joint and JObj translations and scales using both caller weights without normalization. Nearly equal Euler XYZ components within 1e-4 copy Joint rotation and clear quaternion mode. Otherwise converts representations, negates the second quaternion when squared difference exceeds squared sum, and calls HSD_QuatLib_8037EF28 with the JObj weight alone. Sets quaternion mode on that path and marks the destination matrix dirty on both paths.

### lbGetFreeColorRegImpl

Marks const registers below eight from both supplied expression chains and mapped TEV color output registers in an eight-slot local occupancy array. Searches from the supplied start through six and returns the first free index or -1. Negative starting indices and descriptor enum bounds are unchecked.

### lbGetFreeColorRegister

Passes the starting index, mobj->tevdesc->desc, mobj->texp and the extra expression list to lbGetFreeColorRegImpl, returning its result. The material and tevdesc pointers must be valid.

### lb_8000CC8C

Returns unchecked table entry from the eight-value color-input map {14,14,14,14,2,4,6,0}. No state is changed.

### lb_8000CCA4

Returns unchecked table entry from the four-value konst-color map {12,13,14,15}. No state is changed.

### lbGetFreeAlphaRegImpl

Marks mapped TEV alpha output registers in an eight-slot local occupancy array, ignoring both expression arguments. Searches from the supplied start through six and returns the first free index or -1. Negative starting indices and descriptor enum bounds are unchecked.

### lbGetFreeAlphaRegister

Passes the starting index, mobj->tevdesc->desc, mobj->texp and extra expression pointer to lbGetFreeAlphaRegImpl, returning its result. The material and tevdesc pointers must be valid; the callee ignores both expression pointers.

### lb_8000CD90

Returns unchecked table entry from the eight-value alpha-input map {6,6,6,6,1,2,3,0}. No state is changed.

### lb_8000CDA8

Returns unchecked table entry from the four-value konst-alpha map {28,29,30,31}. No state is changed.

### lb_8000CDC0

Returns the first light with direct flag bits zero and one clear and HSD_LObjGetFlags bit five clear. Advances through next without writes. Null input or no match falls off the nonvoid function; no defined null return is guaranteed.

### lb_8000CE30

If the destination DObj is nonnull, replaces its next pointer with the supplied pointer, including null. No allocation, traversal or ownership management occurs.

### lb_8000CE40

If the destination JObj is nonnull, replaces u.dobj with the supplied pointer, including null. Does not check union mode, traverse, free or retain either chain.

## Unresolved Evidence

Gameplay callers, exact physical section layout and full constraint allocation/reference/resolution contracts remain followups. Canonical caller and callee context is separate from owned coverage. Rendered aliases do not prove names. The dox declaration for lb_8000C160 is stale; canonical memzero is authoritative. No source, shared knowledge, compilation, matching, publication or UI changes were performed.
