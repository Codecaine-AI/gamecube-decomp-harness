# Camera Animation and Render Setup

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered lines 1-466 reviewed in full. Caller lines 467-531 reviewed as supporting context. The unslop skill was applied to this write-up.

## Behavior

### HSD_CObjEraseScreen

Clears selected color, alpha, and/or depth outputs across the camera's visible projection by constructing a projection-sized rectangle at the midpoint of the camera's near and far clipping planes and passing it to HSD_EraseRect.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L34-L73

### HSD_CObjRemoveAnim

Detaches the animation state associated with a camera object: it removes the camera's own HSD_AObj, clears that attachment, and removes animation from both the eye-position and interest HSD_WObjs. A NULL camera is accepted as a no-op.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L75-L98

### HSD_CObjAddAnim

Attaches a complete camera-animation description to an HSD_CObj, replacing its previous camera-level animation and installing the supplied eye-position and interest animations on the camera's two WObjs.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L100-L116

### CObjUpdateFunc

Serves as the HSD_CObj animation-property update callback, translating evaluated animation-channel values into camera eye position, interest point, roll, field of view, and near/far clipping-plane updates.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L118-L182

### HSD_CObjAnim

Evaluates one animation step for an HSD camera object by advancing the camera's own AObj channels through CObjUpdateFunc and then evaluating the independently attached eye-position and interest-point WObj animations.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L173-L182

### HSD_CObjReqAnim

Requests that a camera object's own property animation and both of its position-defining world objects begin or resume from a supplied animation frame.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L184-L197

### makeProjectionMtx

Constructs the projection matrix for an HSD camera object's configured projection mode and returns the corresponding GX projection classification so the matrix can be installed in GX render state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L199-L226

### setupNormalCamera

Configures GX for an HSD camera during the normal screen render pass by converting the camera's viewport and scissor rectangles to the active render mode's framebuffer dimensions and loading the camera's projection matrix.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L242-L290

### setupTopHalfCamera

Configures an HSD camera for the top-half render pass by clipping its viewport and scissor rectangle to the upper EFB region and rebuilding its projection so the retained vertical portion preserves the intended camera view.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L292-L379

### setupBottomHalfCamera

Configures an HSD camera for the bottom-half render pass by clipping its scissor and viewport to the lower EFB region and rebuilding its projection so the retained vertical slice preserves the camera's intended view.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L381-L465

## Corrections and Limits

Animation types 5, 6, and 7 all replace interest.x. Types 1, 2, and 3 replace eye.x/y/z. Preserve the source behavior; do not normalize it into an assumed XYZ channel mapping. CObjUpdateFunc returns on null camera and ignores unknown type values. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L118-L171.

Top-half setup ignores the stored camera scissor and derives GX scissor from viewport bounds. Its local matrix is declared Mtx despite projection constructors writing four rows; the source comment documents the matching constraint. No source repair proposed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L292-L379.

Bottom-half setup starts at efbHeight minus 8 and rejects ymax strictly less than that boundary. Equality is not rejected, so the generic phrase "intersects" does not guarantee positive output height. Zero original viewport heights and invalid projection kinds have no local fallback. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L381-L465.

The four section records have source-supported candidate objects, but this review has no object/map proof of exact membership or ordering. All 16 section facts remain unresolved, including the inherited section alias CObj state. Five file-wide facts await sibling synthesis. Existing facts about downstream AObj/WObj internals were narrowed where they exceeded locally inspected behavior.

## Missing Report Targets

HSD_CObjRemoveAnimByFlags: Null-safe removal of camera AObj, field clear, eye and interest animation removal; flags argument is never read. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L75-L89

setupOffscreenCamera: Direct camera viewport and scissor extents feed GX without render-mode scaling, then generated projection is installed and true returned. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L228-L240

## Parameters and Dependencies

All 18 owned parameter entities have zero existing facts. Source signatures identify camera pointers, animation descriptors, erase enable flags, callback object/type/value, the animation frame, and output projection matrix. No register identity is inferred from a C parameter position, especially for float startframe.

Calls depend on aobj, wobj, displayfunc, video/VI, GX, and MTX. Their internal behavior is outside this leaf's reviewed source. Canonical function names already describe these entry points; no new inferred names are proposed. The two renderer parse errors do not truncate the returned ranges.
