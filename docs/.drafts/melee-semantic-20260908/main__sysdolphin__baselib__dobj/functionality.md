# main/sysdolphin/baselib/dobj

Status: TU synthesis complete; independent root review pending.

# Display Object Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC start 2026-09-08T15:12:25.049048Z; end 2026-09-08T15:17:15.862453+00:00. All 350 source and 74 header lines read both canonically and rendered. Source render has two parse errors but complete text; no proposed-name substitutions occur.

## Function Findings

### HSD_DObjSetCurrent

Selects the process-global current display object, establishing which visible, transparency-eligible DObj is active while its polymorphic display method renders its material and polygon attachments.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L19-L22

### HSD_DObjGetFlags

Provides null-safe read access to a display object's complete flag word, allowing callers to inspect the DObj's stored flags without directly dereferencing a possibly null pointer.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L24-L30

### HSD_DObjSetFlags

Null-safely enables one or more state bits on an HSD display object without clearing any flags already present.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L32-L37

### HSD_DObjClearFlags

Disables caller-selected state bits on a display object through a null-safe flag mutator, without disturbing any unselected DObj flags.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L39-L44

### HSD_DObjModifyFlags

Null-safely replaces only flag bits selected by mask using (old & ~mask) | (flags & mask). This is a normal read/modify/write expression with no synchronization or atomicity guarantee.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L46-L53

### HSD_DObjRemoveAnimAllByFlags

Removes the animation channels selected by a flag mask from every display object in a next-linked HSD_DObj list. For each DObj, it can destroy the DObj's own animation controller and delegates selected shape, material-property, and texture-animation teardown to the attached PObj and MObj components without removing the display objects or their component lists.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L55-L80

### HSD_DObjAddAnimAll

Attaches corresponding material- and shape-animation descriptors across a next-linked HSD_DObj list, delegating each aligned descriptor set to the single-DObj attachment routine.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L82-L117

### HSD_DObjReqAnimAllByFlags

For every DObj, forwards the supplied frame and unchanged flags to the attached PObj and MObj animation request paths. The helper does not request dobj->aobj directly.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L119-L140

### HSD_DObjReqAnimAll

Requests the supplied frame through PObj and MObj animation paths for each DObj, using mask 0x7FF. The per-DObj helper does not request dobj->aobj directly.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L119-L153

### HSD_DObjAnimAll

Advances animation for every display object in a next-linked HSD_DObj list. For each DObj, it first evaluates animation for all attached polygon objects and then evaluates the attached material object, including that material's texture animations.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L155-L176

### DObjLoad

Populates an already allocated HSD_DObj from its descriptor by recursively constructing the remaining DObj chain, loading its material and polygon objects, and selecting the DObj's render-classification flag from the loaded material's blending mode.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L178-L202

### HSD_DObjLoadDesc

Constructs a DObj through the default allocation path when class_name is absent or lookup fails. Otherwise it allocates the returned class and casts the instance to HSD_DObj without a descendant check here. It invokes the virtual load callback, ignores its int result, and returns the object.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L206-L228

### HSD_DObjRemoveAll

Removes every display object in a next-linked HSD_DObj list by invoking the single-object deletion path on each node. It serves as the list-wide ownership cleanup operation used when a JObj releases its attached DObj list.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L230-L243

### HSD_DObjAlloc

Creates a new HSD display object using the currently configured DObj class, falling back to the standard DObj class when no override is installed, and treats allocation failure as an assertion error.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L258-L266

### HSD_DObjResolveRefsAll

Performs the list-wide post-load reference-fixup pass for display objects, pairing each loaded HSD_DObj with its source HSD_DObjDesc and resolving references in the corresponding attached polygon-object lists.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L268-L282

### HSD_DObjDisp

Renders one display object by establishing its material as the current rendering context, optionally setting up that material, dispatching display to every polygon object attached to the DObj, optionally tearing the material state down, and finally clearing the current-material context.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L303-L318

### DObjRelease

Performs the DObj-specific release phase: it tears down the display object's attached material object, complete polygon-object list, and animation object before delegating release of the remaining base-class state to the parent HSD class.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L320-L329

### DObjAmnesia

Handles HSD class-amnesia notifications for the display-object subsystem by invalidating the cached default DObj class when that class is forgotten, then propagating the notification to the parent HSD class.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L331-L337

### DObjInfoInit

Bootstraps the HSD DObj runtime class as a subclass of the base HSD class and installs the display-object lifecycle, rendering, and descriptor-loading methods used through HSD class dispatch.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L339-L349

## Dispatch and Lifetime Boundaries

DObjLoad maps material mask 0x60000000 values 0,0x40000000,0x60000000 to DObj mask 0xE values 2,8,4. The remaining value 0x20000000 panics. Missing material leaves those bits unchanged. next is loaded recursively before material and polygons. The loader does not initialize aobj explicitly.

HSD_DObjLoadDesc ignores the virtual load return value. It casts a found named class without testing ancestry, unlike HSD_DObjSetDefaultClass, which asserts descendant status for non-NULL input. A missing named class selects the configured default allocator, not necessarily the base class.

RemoveAll caches next before deleting each node. DObjRelease removes only attachments and delegates parent release; it does not free siblings or clear current_dobj. HSD_DObjSetCurrent borrows the supplied pointer. Displayfunc selects visible objects for the active transparency pass and clears that pointer after traversal. Direct HSD_DObjDisp does not repeat those checks.

Display sets current MObj, optionally invokes setup/unset under bit 0x04000000, dispatches every PObj, then clears current MObj. It does not restore a nested caller state. A valid material is required when setup/unset are enabled. Flag replacement uses ordinary reads and writes with no synchronization.

Animation Add, Req and Anim delegates act on PObj and MObj attachments, while Remove also removes dobj->aobj for bit 0x2. Descriptor chains advance independently with null-safe next_p and traversal is driven by DObj length. Reference resolution instead stops at the shorter runtime/descriptor chain. Linked cycles and callback-induced ownership changes are unchecked.

## Owned Header and Source-only Inventory

The header defines HSD_DObj, HSD_DObjDesc, HSD_DObjInfo and HSD_ShapeAnimDObj plus DOBJ_HIDDEN and three cast/method macros. The class extends HSD_Class with next/material/polygon/animation pointers and flags. The class-info callbacks are void disp with two Mtx arguments and u32 mode, and int load with a descriptor. These declarations have no dedicated manifest subjects.

Eight source functions lack manifest function targets. Their exact ranges and dispositions are in coverage.json. RemoveAnimByFlags, AddAnim, ReqAnimByFlags and Anim are single-object delegates; Remove calls hsdDelete; SetDefaultClass validates an override then stores it; ResolveRefs forwards PObj pairs; forceStringAllocation contains two polygon assertions and a material identity assertion and is explicitly described by source as a string-retention helper.

Source globals are hsdDObj initialized with DObjInfoInit, NULL default_class/current_dobj, and diagnostic arrays dobj.c and dobj. Their source behavior is reviewed, but source declaration order does not establish compiled .data/.sbss/.sdata allocation. All 11 section facts stay unresolved.

## Naming and Coverage

All 19 function names are canonical and retained. No inferred aliases are present or proposed. Every existing fact has its ID, updated_at version, explicit disposition and canonical evidence. All 32 parameter entities receive exact source types and roles. Foreign caller reads confirm hierarchical animation, fighter-part visibility and metal render-bit transitions without claiming ownership of those files.

Static review and proposal validation only; no source/shared KB edits, matching, publication or UI actions.

{"targets": 22, "function_targets": 19, "section_targets": 3, "entities": 33, "subjects": 55, "facts": 97, "retained": 56, "superseded": 30, "unresolved": 11, "proposed_facts": 63, "source_only_functions": 8}


## TU independent review

Owned C350/H74 independently reviewed canonically and separately rendered. C has2 parser errors but complete unchanged text; header clean. All97 facts and63 operations reviewed. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L1-L350`.

DObj derives directly from HSD_Class, not HSD_Obj. Named loader lacks ancestry validation and ignores load result; only explicit default-class setter validates descent. Release frees attachments but does not traverse next or clear current_dobj. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L206-L349`.

Add/request/interpret delegate only PObj/MObj; removal additionally destroys own aobj for bit2. Runtime list controls attachment traversal while paired reference resolution stops at shorter list. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L55-L176`.

Foreign canonical-only MObj40-157/PObj44-176 confirm null delegates, category masks, shape/material channels, texture delegation, and PObj shape assertions. Direct display bypasses hidden/transparency checks, uses render0x04000000 to skip material setup/unset, and clears current material on return. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L303-L318`.

Foreign canonical-only displayfunc280-308 confirms caller filtering and selected-current clear. ftmetal40-96 confirms mask0xE metal activation/restoration. Existing complete class22-58 supporting read confirms initializer dispatch. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L280-L308`.

Two additional existing data-flow facts are deferred because they describe material setup as unconditional despite rendermode skip bit. Proposal correctly records conditional callbacks. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/dobj.c#L303-L318`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
