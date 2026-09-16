# GObj Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC start 2026-09-08T14:32:29.732171Z; end 2026-09-08T14:37:28.369362+00:00. All 275 source lines and all 173 header lines read in canonical and frozen rendered views. File hashes, page ranges, substitutions and foreign-context exceptions are in coverage.json.

## Function Findings

### HSD_GObj_80390C5C

Suspends process-callback execution for an HSD_GObj by setting the primary suppression flag on every HSD_GObjProc attached through its process child chain.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L46-L65

### HSD_GObj_80390C84

Removes the primary execution inhibition from every process attached to an HSD_GObj, making those process callbacks eligible to run again unless another scheduler guard still suppresses them.

Existing alias `HSD_GObjResumeProcs`: supersede. Proposed `HSD_GObjClearProcFlag1`.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L46-L70

### HSD_GObj_80390CAC

Clears the second execution-inhibit flag on every process attached to a GObj, making those process callbacks eligible to run again when the process-link mask and the other inhibit flag also permit execution.

Existing alias `HSD_GObj_ResumeProcs`: supersede. Proposed `HSD_GObjClearProcFlag2`.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L54-L75

### HSD_GObj_80390CD4

Marks every process attached to an HSD_GObj as already visited in the process scheduler's current generation, allowing the scheduler to suppress those callbacks for the remainder of the current traversal.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L77-L85

### HSD_GObj_80390CFC

Runs one HSD_GObj process-scheduler pass. It walks every process-priority bucket, invokes each eligible HSD_GObjProc callback at most once for the current scheduler generation, and drains any destruction, process-link relocation, or process-removal operation deferred by the callback before traversal continues.

Existing alias `GObj_RunProcs`: retain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L87-L141

### HSD_GObj_80390EB8

Converts a GObj rendering-pass index into the HSD transparency mask expected by JObj hierarchy rendering.

Existing alias `HSD_GObjGetTrspMask`: retain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L143-L147

### HSD_GObj_80390ED0

Dispatches selected GObj rendering groups for one or more render-pass indices. For every set bit in the supplied pass mask, it visits each GX-link list enabled by the caller GObj's 64-bit gxlink_prios mask and invokes every non-null render callback in that list with the pass bit's index.

Existing alias `HSD_GObj_SetTextureCamera`: supersede. Proposed `HSD_GObjDispatchRenderPasses`.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L149-L183

### HSD_GObj_80390FC0

Runs every available render callback in the dedicated GX-link bucket immediately beyond the configured maximum normal GX link.

Existing alias `GObj_RunGXLinkMaxCallbacks`: retain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L185-L199

### HSD_GObj_LObjCallback

Acts as the HSD_GObj render callback that activates the light-object chain attached to the GObj and rebuilds camera-relative GX lighting state for the current render camera.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L201-L205

### HSD_GObj_JObjCallback

Serves as the standard GObj rendering callback for an attached JObj hierarchy: it converts the current GObj render-pass argument into an HSD transparency mask and delegates traversal and drawing of the hierarchy to `HSD_JObjDispAll`.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L207-L221

### HSD_GObj_FogCallback

Serves as the standard HSD_GObj render callback for a fog object, applying the GObj's attached HSD_Fog to the active GX rendering state.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L223-L226

### HSD_GObj_803910D8

Serves as the standard HSD camera-object render callback: it activates the HSD_CObj attached to a GObj, renders the GX-linked scene groups selected for that camera, and completes deferred depth-sorted drawing for the camera pass.

Existing alias `HSD_GObj_CObjCallback`: retain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L228-L234

### HSD_GObj_80391120

For non-null input, requests deletion through hsdDelete when ref_DEC returns true; NULL is a no-op. The ref_DEC predicate accepts HSD_OBJ_NOREF without decrementing, or postdecrements a normal count and accepts an old value of zero.

Existing alias `HSD_ObjUnref`: retain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L236-L241

### HSD_GObj_803911C0

Forwards its HSD_Obj pointer to HSD_GObj_80391120. For non-null input, requests deletion through hsdDelete when ref_DEC returns true; NULL is a no-op. The ref_DEC predicate accepts HSD_OBJ_NOREF without decrementing, or postdecrements a normal count and accepts an old value of zero.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L236-L246

### HSD_GObj_80391260

Registers the GObj subsystem's built-in four-entry object-destruction callback group with a mutable library-initialization descriptor and reserves the four consecutive object-kind indices represented by that group.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L248-L269

### HSD_GObj_803912A8

Appends a GObjFuncs block to the init descriptor's callback-block list, clears the appended block's next pointer, and returns the prior block sizes accumulated in u8 arithmetic as its base index.

Existing alias `HSD_GObjRegisterFuncs`: retain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L257-L269

## Scheduling and Rendering Invariants

The scheduler snapshots the process-link mask once, then advances its generation through 0, 1, 2. It stamps each unstamped node before testing flags_1, flags_2, or the link mask. Suppressed nodes therefore count as visited in that pass. Callback context globals are cleared after invocation; the traversal next pointer is captured before invocation and refreshed before deferred operations. b1 takes precedence; otherwise b3 relocation precedes b2 process removal.

Render dispatch walks pass bits first and GX-link bits second, both ascending. It rereads gxlink_prios at each enabled pass. Ordinary callbacks save/restore HSD_GObj_804D7814; the special gx_link_max+1 bucket saves/restores HSD_GObj_804D7818 and supplies argument zero. Neither callback list loop snapshots next_gx before invocation, so arbitrary immediate removal is not proved safe by this TU.

Camera callback ignores its integer argument and uses mask 7 after successful CObj activation. JObj callback maps indices through {1,4,2,0}, corresponding to opaque, texture-edge, translucent, and zero. Fog and light callbacks ignore their pass arguments.

Registration uses a u8 accumulator and builtin-kind increment sequence. Arithmetic can wrap and no duplicate or cycle checks exist. It appends the caller block and forcibly clears next, rather than copying the block.

## Header and Data Review

The header defines classifier constants, HSD_GObj fields, cleanup callback groups, initialization limits and mask pointer, the pending-operation union, and external globals. Four inline accessors directly return user_data, hsd_obj, classifier, or next without a null check; four GET macros cast hsd_obj to subsystem pointers. HSD_GObjList is explicitly described as a fake type for an array of pointers indexed by p_link. Its fighter/item labels and tentative effect comments must not become generic layout facts.

The declarations for GObj_Create, HSD_GObj_803912E0, and HSD_GObj_80391304 refer to other TUs and are contextual. Source-only inline helpers write process flags or save/restore render context; they have no manifest target. No shared type/field subject is writable in this assignment.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.h#L8-L170

The source shows zero-initialized globals, a four-int display mask table, four cleanup callbacks and their group descriptor, allocator records, and init/deferred-operation records. Source does not prove the byte sizes or exact ownership of .bss/.data/.sbss contributions. All 11 section facts remain unresolved as section attribution; source-level observations remain documented.

## Naming and Dependency Limits

HSD_GObjResumeProcs and HSD_GObj_ResumeProcs are replaced with distinct flag-clear names. HSD_GObj_SetTextureCamera is replaced with a render-pass dispatch name. GObj_RunProcs and GObj_RunGXLinkMaxCallbacks are retained as comment-attested candidates, not original binary symbols. Renderer source-view.ts lines 140 and 178 scans all raw words, including comments, and marks these aliases as collisions with their own comments at gobj.c87 and185. Baseline name queries found no second target for either alias or any of the three new candidates.

ref_DEC is not a conventional decrement-to-zero function: the sentinel returns true unchanged, otherwise the old count is tested after a postdecrement. Seven lifecycle facts are narrowed accordingly. These claims are supported by pinned object.h74-81; no shared-header entity is modified.

Two broader game mappings, category-specific scheduler use and GX-link category selection, are unresolved pending concrete callers. Staff Roll flag changes are independently supported by gmstaffroll.c1162-1180. Fog, light, camera, JObj, registration and special-bucket claims have the dependency ranges listed with each fact. Foreign files were canonical context reads only; complete rendered shared-family review is not claimed.

## Coverage and Proposal

{"targets": 19, "entities": 21, "existing_facts": 95, "retained": 67, "superseded": 15, "unresolved": 13, "proposed_facts": 35}

Every current fact has an ID, updated_at revision, explicit disposition, and full pinned citations in dispositions.json. All 20 empty parameter subjects receive source-backed purpose proposals. The proposal is dry-run only; independent name and cross-file review is required before promotion.
