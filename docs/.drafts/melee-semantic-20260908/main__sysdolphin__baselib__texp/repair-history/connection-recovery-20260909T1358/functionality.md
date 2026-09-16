# main/sysdolphin/baselib/texp

Status: TU synthesis complete; independent root review pending.

# HSD texture expressions

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical and separate rendered C1236/H213 reviewed. UTC 2026-09-08T15:43:50.160941+00:00 to 2026-09-08T15:49:09.555702+00:00.

## Entry points

### HSD_TExpGetType
Classifies an HSD texture-expression reference without blindly dereferencing it, allowing ordinary expression nodes and the encoded zero, texture-sample, and raster-color pseudo-expressions to be handled through one HSD_TExpType interface.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L11-L23

### HSD_TExpRef
Acquires one logical reference to an HSD texture-expression dependency. A TEV expression tracks references to its color and alpha results separately, while a constant expression uses one shared reference count.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L53-L72

### HSD_TExpUnref
Releases one logical reference to an HSD texture-expression node. Constant nodes lose one shared reference, while TEV nodes lose either a color-result or alpha-result reference and recursively release their eight color/alpha input dependencies once neither result remains referenced; the routine updates ownership counts but does not free node storage.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L74-L104

### HSD_TExpFreeList
Reclaims selected nodes from a linked list of HSD texture expressions, either forcibly or only when their reference counts permit collection, and returns the surviving list head.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L106-L179

### HSD_TExpTev
Allocates a blank HSD TEV-expression node, inserts it at the head of the caller-owned texture-expression list, and establishes the initial state needed for later order, operation, and input configuration.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L181-L200

### HSD_TExpCnst
Finds or creates a constant-valued HSD texture-expression node so material and texture-expression builders can refer to an external scalar or color value without duplicating equivalent nodes in the same expression list.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L202-L238

### HSD_TExpColorOp
Configures the color-combiner operation of an existing HSD TEV expression node, recording its operation, clamp mode, bias, and scale for later conversion into a hardware TEV-stage descriptor.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L240-L255

### HSD_TExpAlphaOp
Configures the alpha-combiner operation of an existing HSD TEV expression node, recording its operation, clamp mode, bias, and scale for later conversion into a hardware TEV-stage descriptor.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L257-L272

### HSD_TExpColorInSub
Configures one indexed input of a TEV expression's four-argument color combiner, translating an HSD texture-expression selector and source into the corresponding GX color argument, component swap, and, when applicable, the stage's color-konst selection.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L274-L465

### HSD_TExpColorIn
Configures all four color-combiner input slots of an existing TEV texture-expression node.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L467-L481

### HSD_TExpAlphaInSub
Configures one indexed input of a TEV expression's four-argument alpha combiner, translating an HSD texture-expression selector and source into the corresponding GX alpha argument and, when applicable, the stage's konst-alpha selection.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L483-L582

### HSD_TExpAlphaIn
Configures all four ordered alpha-combiner input slots of an existing TEV texture-expression node.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L584-L598

### HSD_TExpOrder
Associates an HSD TEV expression node with the texture object and raster color channel that its eventual hardware TEV stage should use.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L600-L611

### AssignColorReg
Assigns a constant color operand of one HSD TEV expression input to a regular TEV color register, either reusing the constant's existing regular-register assignment or reserving a compatible free slot when konst allocation is unavailable.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L613-L661

### AssignAlphaReg
Assigns one constant alpha operand of an HSD TEV expression to the alpha channel of a regular TEV color register, then rewrites that stage input to use the corresponding immediate TEV alpha argument.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L663-L691

### AssignColorKonst
Assigns one constant color operand of an HSD TEV expression to a usable TEV konst register or channel and rewrites that stage input to consume the selected konst source.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L693-L766

### AssignAlphaKonst
Assigns a constant alpha operand of an HSD TEV expression to an available channel of a GX konst color register and rewrites that stage input to consume the selected konst source.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L768-L818

### TExpAssignReg
Assigns every referenced constant input of one TEV texture-expression stage to an available regular TEV register or konst source, choosing an order appropriate to the stage's color and alpha configuration so the expression can be compiled.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L820-L917

### TExp2TevDesc
Lowers one scheduled HSD TEV expression node into an HSD_TExpTevDesc that can be linked into the compiled hardware-stage list, filling the stage's texture, raster channel, swap, konst-selection, color-combiner, and alpha-combiner configuration.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L919-L1031

### HSD_TExpSetReg
Materializes the constants assigned to an HSD texture expression into the GameCube's TEV constant and regular-color registers, converting the expression's supported numeric representations into hardware-ready eight-bit color channels before issuing GX updates.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1037-L1166

### HSD_TExpSetupTev
Applies a compiled HSD texture expression to rendering state by uploading its assigned constants and configuring every TEV stage descriptor in the supplied list.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1168-L1179

### HSD_TExpCompile
Compiles a TEV-rooted HSD expression graph through simplification, DAG scheduling and resource assignment into a linked list of numbered stage descriptors. Returns the emitted count, forcibly removes all TEV nodes from the supplied ownership list and removes only zero-reference constants, retaining referenced constants for later uploads. It does not free the external values referenced by constant nodes.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1181-L1225

### HSD_TExpFreeTevDesc
Destroys an entire linked list of compiled HSD TEV-stage descriptors, returning every HSD_TExpTevDesc allocation to the HSD size-class allocator. It is used both when a material recompiles its TEV program and when the material itself is released.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1227-L1235

## Reference and construction boundaries

Sentinel pointers NULL/-1/-2 represent ZERO/TEX/RAS. Only selector1 increments or decrements TEV color; every other selector uses alpha. Constant ref is u8, TEV counts are s32. Increments have no overflow guard. Unref recursively visits dependencies whenever both counters are zero after the decrement checks, not solely at a transition; repeated zero-count calls can repeat traversal. Selective FreeList tests c_ref twice and calls selectors1 and5, so its prepass can decrement an alpha-only reference and can repeat dependency release. Forced free does not recursively unref. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.h#L10-L56; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.h#L123-L165; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L53-L179.

TEV construction fills bytes with255 before explicit defaults; constant construction deduplicates external pointer plus component, asserts ctype equality and leaves range uninitialized. HSD_TE_0 is numeric7, not C false. The constant storage is borrowed and never copied or freed here. All77 parameter subjects are empty and reviewed, including nine arguments for each four-input wrapper and indexed private allocator contracts. No new canonical names proposed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L181-L238; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.h#L16-L44.

## Input and resource semantics

Input wrappers replace A/B/C/D sequentially; a later assertion can leave earlier updates. Helpers overwrite the slot before validating it and acquire the new dependency before releasing the old one. Color 0/1/half clear exp; other fractions retain the incoming exp pointer without acquiring its reference and set type KONST. Color kcsel panics when the existing selector equals the new selector; a different existing selector is left unchanged. Alpha fixed constants clear exp and require matching kasel. Texture/raster color swaps must agree, while alpha needs no swap. Existing selectors are not reset on replacement. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L274-L598.

Regular allocator slots4-7 include PREV; scalar color uses their alpha and other color uses RGB. Konst scalars prefer K1-K3 alpha, then K0-K3 RGB components; vectors require unused RGB triples. Assignment helpers trust idx and expression shape and do not consistently upper-bound reused regular register indices. Konst helpers overwrite shared selectors without validating compatibility. TExpAssignReg may apply a konst attempt to every ordinary constant despite the stage-wide selector, and subsequent second loops do not run because i already equals4. This is literal source behavior, not a claim of hardware-correct multi-constant output. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L613-L917.

## Compilation and rendering boundaries

Compile consumes all TEV ownership-list entries and only unreferenced constants. The root must reach the DAG builder as a TEV. Arrays have32 entries; DAG collection appends nodes before its per-iteration index assertion, and hardware stage conversion accepts only0-15. No broad size-safety guarantee follows. The resource accumulator is not reset before the second schedule. Emission assigns ascending stage numbers while prepending, yielding descending stage numbers in linked traversal; SetupTev increments the global stage count but ignores its returned identifier and programs each stored descriptor stage. Existing output descriptors are overwritten without cleanup by Compile itself. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1181-L1225; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L159-L205; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tev.c#L204-L240; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tev.c#L289-L328.

Lowering preserves defined color operations without color references for alpha compare operations8-13; other inactive halves use zero/PREV defaults with shared initialization flags. Flags=1 selects explicit TEV configuration. Texture-attached map/coord are deferred until SetupTev; no-texture lowering assigns255. SetupTev does not call HSD_StateSetNumTevStages. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L919-L1031; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1168-L1179; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tev.c#L204-L240.

SetReg starts with an uninitialized GXColor[8], so unchanged channels are not hardware-preserved values. RGB U8 reads four bytes while preserving local alpha. RGB U32 saturates unsigned, scalar U32 converts to signed int first. Floating conversions precede saturation, so out-of-range/nonfinite inputs lack a safe conversion guarantee. Slot7 can set changed and trigger sync/invalidation but is never uploaded; only0-6 have upload paths. No writes occur for an empty changed mask. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1033-L1166.

## Source-only inventory

- TevAlloc: Allocates HSD_TETev-sized pooled storage and asserts nonnull. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L25-L30
- CnstAlloc: Allocates HSD_TECnst-sized pooled storage and asserts nonnull. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L32-L37
- HSD_TExpFree: Dispatches pooled free by actual TEV/constant type; other kinds including sentinels are no-ops. Does not release dependencies or external values. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L39-L51
- IsThroughColor: Recognizes ADD with A/B selectors zero, zero bias and unit scale; does not inspect C/D, clamp, type or null. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.h#L198-L203
- IsThroughAlpha: Analogous alpha predicate; no C/D, clamp, type or null check. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.h#L205-L210

## Coverage

{"functions": 23, "sections": 3, "file_entities": 1, "parameters": 77, "existing_facts": 127, "proposed_facts": 9, "dispositions": {"unresolved": 12, "retain": 106, "supersede": 9}, "existing_links": 22, "link_dispositions": {"retain": 19, "unresolved": 3}}

All exact facts, versions and complete records are preserved. All22 exact outgoing links retain their baseline fields/digests;19 implementation links retained and3 section links unresolved. Source typed lookup arrays are inventoried without asserting their emitted section. Renderer had no parse errors or substitutions. No source/shared KB writes, matching, Git, UI, runtime or publication work.


## TU independent review

Sentinels NULL/-1/-2 classify without dereference; TEV color uses selector1 and all other selectors use alpha. Unref repeats dependency traversal on already-zero nodes and frees no storage; selective FreeList prepass tests color twice and may decrease alpha-only references. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L11-L179`.

TEV constructor fills255 before resetting refs, texture and operands. Constants intern borrowed value pointer plus component, assert ctype equality, leave range uninitialized and treat selector7 as zero. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L181-L238`.

Op setters normalize clamp and zero bias/scale outside ADD/SUB. Input wrappers mutate A-D sequentially; helpers mutate before assertions and reference new before releasing old. Fractional color selector equality panics, differing selector is retained; color fractions keep exp without acquiring a reference, whereas alpha fractions clear exp. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L240-L598`.

Regular allocation includes slots4-7 and accepts reused assignments without an upper-bound check. Konst allocation packs scalars in K1-K3 alpha then K0-K3 RGB, vectors in RGB triples. Existing assignments overwrite shared selectors; ordinary loops can overwrite selectors repeatedly, and second loops are inert. Failure preserves prior assignments. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L613-L917`.

Lowering borrows texture and defers attached map/coord to setup. Stage is assigned by caller. Disabled halves seed PREV then pass through; alpha comparisons8-13 retain defined color without references. Destination guard excludes255 but does not bound table index. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L919-L1031`.

SetReg uses uninitialized GXColor[8]; U8 RGB restores local alpha, scalar U32 converts to signed int before clamp, and floating conversion precedes saturation. Slot7 is marked but never uploaded. NULL-member address formation relies on target layout conventions rather than a portable-C null-member guarantee. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1033-L1166`.

Setup uploads constants first and refreshes texture fields, increments stage count but uses stored IDs. Compile reuses its resource accumulator for second schedule, allocates fixed32 work arrays without a complete graph bound, prepends ascending stages into descending traversal, overwrites old output without cleanup and consumes all owned TEVs but only unreferenced constants. Descriptor allocation has no local null check. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.c#L1168-L1235`.

Header distinguishes signed TEV refs from u8 constant refs and resource counters. Through predicates check ADD, A/B zero, bias and scale but omit C/D, clamp, type and null. Source-only helpers and77 empty parameter identities are inventoried by the librarian. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texp.h#L10-L210`.

Material construction supplies borrowed diffuse/alpha/specular values; recompilation and release free prior descriptors. TObj builder supplies sampled texture and blending constants. Pool free uses rounded size class. State invalidation dispatches matching masks. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L191-L375`.

Full texpdag and tev owned review was completed immediately before texp. DAG collection and scheduling do not justify a global size/optimality guarantee; hardware stage converter only accepts0-15. These previously reviewed canonical sources support the caller boundaries without treating foreign renderer output as owned evidence. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L159-L392`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
