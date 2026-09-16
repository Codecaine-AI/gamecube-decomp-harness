# main/sysdolphin/baselib/mobj

Status: TU synthesis complete; independent root review pending.

# Material Object Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC 2026-09-08T15:28:37.997358Z to 2026-09-08T15:33:02.147646+00:00. All 592 C lines and 187 header lines read separately in canonical and rendered form. One C parse error, zero substitutions, complete text. Hashes and read ranges are in coverage.json.

## Entry Points

### HSD_MObjSetCurrent

Selects the process-global current material object, establishing the material context for a display object's material setup, polygon rendering, and material teardown.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L21-L24

### HSD_MObjSetFlags

Null-safely enables one or more rendering-mode bits on an HSD material object without clearing any rendering options already enabled.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L26-L31

### HSD_MObjClearFlags

Disables caller-selected rendering-mode options on a material object through a null-safe bitmask mutator, without replacing or disturbing the object's other rendering-mode state.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L33-L38

### HSD_MObjRemoveAnimByFlags

Selectively detaches animation state from one HSD material object. According to the supplied channel mask, it can destroy and clear the MObj's own animation controller and independently remove animation from every attached texture object.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L40-L53

### HSD_MObjAddAnim

Attaches a composite material-animation description to an HSD_MObj, replacing its previous material-level animation controller and distributing the supplied texture-animation descriptors across the material's texture-object chain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L55-L68

### HSD_MObjReqAnimByFlags

Requests that selected animation channels of a material object and its attached textures begin from a supplied frame.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L70-L79

### HSD_MObjReqAnim

Requests that all animation channels associated with a material object and its attached texture objects begin or resume from a supplied frame.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L81-L84

### MObjUpdateFunc

Acts as the per-track animation update callback for an HSD material object, dispatching material-animation attributes to the corresponding material color, opacity, or pixel-engine property.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L86-L141

### HSD_MObjAnim

Evaluates one animation step for an HSD material object by interpreting its material-property AObj through MObjUpdateFunc and then advancing animation for its attached texture-object chain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L143-L150

### MObjLoad

Initializes an existing HSD_MObj from an HSD_MObjDesc by loading its texture-object chain, allocating and copying its material state, enabling toon rendering, optionally cloning its pixel-engine state, and clearing its animation-object attachment.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L152-L165

### HSD_MObjLoadDesc

Constructs a runtime MObj using the looked-up named class or configured default allocation path, calls its virtual load callback, ignores that callback result and compiles TEV state before returning. No named-class ancestry check occurs here.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L167-L189

### MObjMakeTExp

Builds the HSD texture-expression graph that represents a material object's TEV color and alpha pipeline, combining material constants or vertex colors with diffuse, ambient, toon, specular, and extension texture contributions so the graph can subsequently be compiled into a TEV descriptor.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L191-L335

### HSD_MObjCompileTev

Rebuilds a material object's compiled TEV configuration from its texture objects: it discards the previous compiled descriptors and expression list, incorporates enabled shared shadow and toon textures, assigns texture resources, asks the material class to construct a texture-expression graph, and compiles that graph into a new TEV descriptor list.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L337-L375

### MObjSetupTev

Configures a material object's TEV rendering state by applying its compiled texture expression and then setting up the volatile TEV stages required by the supplied texture-object chain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L383-L388

### HSD_MObjSetup

Configures the complete draw-time rendering state for an HSD material object: material colors and optional shininess, the effective texture-object chain, texture coordinates, material-specific TEV stages, and pixel-engine render mode.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L390-L425

### HSD_MObjUnset

Tears down the material object's texture binding after material rendering by directing the texture-object subsystem to set up an empty texture list.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L427-L430

### HSD_MObjSetToonTextureImage

Sets the image descriptor used by the material subsystem's shared toon texture object, creating that texture object from its descriptor on first use.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L450-L458

### HSD_MObjSetDiffuseColor

Sets the red, green, and blue components of a material object's diffuse color without modifying its diffuse alpha component.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L460-L465

### HSD_MObjSetAlpha

Updates the alpha component of the material attached to an HSD material object.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L467-L470

### HSD_MObjGetTObj

Provides null-safe access to the texture-object chain attached to an HSD material object, allowing callers to obtain the chain head without directly dereferencing a possibly null HSD_MObj.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L472-L478

### HSD_MObjRemove

Provides the null-safe lifetime endpoint for a single material object, invoking its class-specific resource-release method before destroying the class instance.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L480-L486

### HSD_MObjAlloc

Creates a new HSD material object through the HSD class system, using the configured default MObj subclass when one is installed and otherwise using the standard MObj class, then asserts that construction succeeded.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L488-L494

### HSD_MaterialAlloc

Allocates a standalone HSD_Material record and initializes it as a blank material whose alpha factor starts at the fully enabled value of 1.0.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L496-L503

### HSD_MObjAddShadowTexture

Registers a non-null HSD_TObj in the global shadow-texture chain so materials using RENDER_SHADOW can incorporate that texture during TEV compilation and rendering setup. Re-registering the same texture is a no-op.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L505-L516

### HSD_MObjDeleteShadowTexture

Unregisters a specified shadow TObj from the global active-shadow texture list, or unregisters every shadow texture when passed NULL. It only detaches list nodes and does not free or unreference their texture objects.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L525-L544

### MObjRelease

Performs the release phase of an HSD material object: it removes the material animation object and all attached texture objects, frees the material, compiled TEV description, texture-expression list, and pixel-engine descriptor owned by the MObj, then delegates final base-class cleanup to the parent release callback.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L546-L564

### MObjAmnesia

Handles HSD class-amnesia notifications for the material-object subsystem by invalidating MObj-global references associated with the forgotten class, then propagating the notification to the parent HSD class.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L566-L576

### MObjInfoInit

Bootstraps the HSD MObj runtime class as a subclass of the base HSD class and installs the lifecycle, material setup/unset, descriptor loading, texture-expression construction, and TEV setup methods used through HSD class dispatch.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L578-L591

## TEV and Texture Lifetime

MakeTExp overwrites the output list head, selects the last toon-coordinate texture, seeds vertex or live material constants, and builds diffuse/ambient, optional diffuse lighting, optional specular and extension stages. done is passed to texture callbacks as history; this TU does not itself prohibit repeated use. A final node combines separate color and alpha roots. Constants refer to material field addresses, so material lifetime matters.

CompileTev frees old products first and ignores the compiler stage-count return. Shadow chains are appended temporarily; their saved tail is cleared after normal completion. Toon prepending overwrites the global toon next pointer and never restores it. Setup repeats this chain construction, ignores its incoming mode, and uses stored rendermode. Overlapping/cyclic chains or reentrant calls are not guarded. No transactional recovery is shown.

SetFlags and ClearFlags change only stored bits. Image and shadow registry changes do not automatically recompile materials. SetToonTextureImage borrows the image pointer and accepts NULL, which disables toon inclusion without deleting the shared TObj. Shadow insertion uses the same intrusive next field as ordinary texture lists; removal only detaches and never frees nodes.

## Animation, Loading and Release

Animation input is unchecked. RGB and PE attributes cast 255.0 times fv to u8; alpha stores 1.0F minus fv. Direct SetAlpha stores its input unchanged. Material request bit 0x4 and texture bit 0x10 are independent; the all-mask is 0x7FF. renderanim descriptors are defined in the header but AddAnim uses only aobjdesc and texanim.

Load copies required material and optional PE data, forces toon, clears AObj, and leaves pe unchanged for absent pedesc. It does not consume renderdesc or initialize compilation fields. Existing attachments are not released before overwrite. LoadDesc checks neither named-class ancestry nor virtual load return before compiling. No setter for default_class is defined here, although allocation has an override branch.

Remove dispatches release then destroy without reference-count decrement. Release frees owned resources but does not clear object fields or current_mobj. Amnesia clears selected global pointers without freeing textures or detaching registry links; current_mobj is unchanged. DObj drawing sets current_mobj before dispatch and clears it afterward. Unset itself merely calls texture setup with NULL.

## Header and Inventory

All 28 source functions correspond to manifest targets and keep their canonical names; no inferred aliases exist. The header owns ten type definitions and the render/animation constants, including setup/load/expression/TEV/unset callback slots. HSD_MObjSetupFunc is verified in forward.h as void (*)(HSD_MObj*,u32). The 45 parameter entities receive source types and roles. Globals and header types lack dedicated manifest entities and are inventoried without creating identities.

Four section targets remain unresolved as compiled placement claims. Exact source declarations and values do not prove section order, byte size or padding. All outgoing baseline link records are retained verbatim in link-dispositions.json, with per-link current evidence and decisions.

Static review and dry-run proposal validation only. No source/shared KB mutation, matching, Git publication or UI actions.

{"targets": 32, "function_targets": 28, "section_targets": 4, "entities": 46, "subjects": 78, "facts": 142, "retained": 83, "superseded": 43, "unresolved": 16, "proposed_facts": 93, "links": 27, "links_retained": 21, "links_unresolved": 6}


## TU independent review

Independently read full owned C592/H187 canonical and separate rendered views, with C1 parser error but complete text, H0, zero substitutions. All142 baseline facts and93 proposals independently reviewed, including every parameter type write. Parameter IDs are manifest positional identities, not proof of ABI register assignment. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.h#L1-L187`.

MObj inherits HSD_Class directly. Loader forces toon, leaves pe unchanged on null descriptor arm, ignores renderdesc, and does not release existing attachments. Named class selection has no local ancestry check and ignores virtual load result. Amnesia clears selected global pointers without resource release or current-material cleanup. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L152-L189`.

Expression construction picks last toon coordinate object independent of map validity, uses borrowed field addresses for constants, and forwards role history without local deduplication. Compilation frees existing products before rebuilding; shared toon next is overwritten and not restored. Nonoverlapping acyclic lists and no reentrant mutation are required. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L191-L375`.

Setup discards incoming mode for stored rendermode and does not set current material. Unset calls TObjSetup(NULL), whose implementation only clears retained tobj_head and immediately returns without GX writes; inherited texture-binding teardown claim deferred. DObj material setup/unset is conditional on flag04000000, so the inherited unconditional current-context data-flow wording is deferred. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L390-L430`.

Animation uses unchecked255.0 byte conversions and inverted alpha1-value. AObj interpretation returns for NO_ANIM; texture traversal still runs. Cnst stores the exact supplied pointer. Full leaf context ranges independently read here or earlier owned dobj/shadow review; additional TObjSetup/Volatile/Anim and Cnst support read canonically only. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L40-L150`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
