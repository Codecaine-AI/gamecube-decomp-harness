# Generator Independent Synthesis

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Independent reader `generator_independent_lifecycle`. UTC 2026-09-08T16:41:45.855Z to 2026-09-08T16:48:34.358876+00:00.

Accepted original proposal `0273cd987ca06eef429187c6750e4a4497edf855dc053ec7c156d04772491ac3`. All 25 operations pass dry-run with zero rejected/skipped. No required correction. Original librarian and top-level files are unchanged.

## Coverage

All 1245 C lines and 41 header lines read canonically and separately rendered to EOF. Zero parser errors, 22 substitutions. Five header shadowed bindings were left canonical by the renderer. All 119 frozen facts and 23 exact links reviewed; fields, versions, locators, digests and duplicate identity records are preserved in the JSON ledgers. All 26 parameter entities have exact declarations and bounded roles.

## Independent Function Contracts

### hsd_8039D1E4

`void hsd_8039D1E4(HSD_Generator* gen, void* userfunc)`

Direct assignment to userfunc. Required gen, nullable opaque value. No invocation or ownership transfer. Storage is HSD_PSUserFunc*, while the effect library supplies a void-returning callback vector; this review does not infer C function-type compatibility.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L24-L27

### hsd_8039D1EC

`u16 hsd_8039D1EC(void)`

Increments shared u16 counter, wraps low result to 0x100, returns updated ID. First initial issue is 0x101. IDs can repeat after wrap and init does not reset this static counter.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L29-L36

### hsd_8039D214

`void hsd_8039D214(HSD_Generator* gen)`

Type0x100 and JObj gate matrix setup. Type0x200 copies matrix translation to gen position; 0x800 and 0x1000 update AppSRT translation/scale only when its gp equals gen. No orientation update here.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L38-L71

### hsd_8039D354

`void hsd_8039D354(u32 unused)`

Initializes generator pool using sizeof(HSD_Generator), alignment4; clears head, generator counts, camera, cursor, pending bake queue and callback globals. Does not traverse existing generators or release their resources. ID counter remains untouched.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L73-L85

### hsd_8039D3AC

`HSD_Generator* hsd_8039D3AC(HSD_Generator* gen, HSD_Generator* prev)`

Optional type0x80 first invokes particle deletion. Defers on numChild!=0, or the exact attached owned-AppSRT gate with usedCount!=1. Deferral writes random0/genLife1 and returns gen. Otherwise unlinks through prev/head, removes AppSRT, unrefs JObj, frees generator and decrements count; returns prev. Requires valid list predecessor and noninterfering callbacks.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L87-L128

### hsd_8039D4DC

`void hsd_8039D4DC(HSD_Generator* gen)`

Scans for gen identity without dereferencing unmatched input; NULL is allowed. On match delegates retirement and recomputes tail cursor; on no match cursor finishes at tail. A deferred generator remains linked.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L130-L155

### hsd_8039D580

`void hsd_8039D580(HSD_JObj* jobj)`

NULL JObj is a no-op. Saves successor and requests retirement for each direct identity match. Does not traverse joint children; matching generators can remain linked and attached.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L157-L172

### hsd_8039D5DC

`void hsd_8039D5DC(HSD_JObj* jobj)`

Same retirement request per visited joint; NULL is a no-op. Processes current joint before stopping child recursion at flag0x1000, JOBJ_INSTANCE. Descendants only, no traversal of the supplied root sibling chain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L174-L198

### hsd_8039D688

`void hsd_8039D688(HSD_JObj* jobj, f32** unused1, s32 unused2)`

Scans by nullable JObj identity; NULL can match unattached generators. Adds0x80 only for matches with AppSRT and type0x100, then retires and uses returned node as predecessor. Remaining two arguments unused.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L200-L223

### hsd_8039D71C

`void hsd_8039D71C(HSD_Generator* gen)`

Type0x100 and non-NULL JObj gate work. Transfers optional translation/owned AppSRT components; normalizes matrix columns independently then multiplies velocity. This is not shear removal or guaranteed speed preservation. Line shape1 offset uses raw3x3. Does not itself unref or clear JObj; manager does afterward.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L225-L308

### hsd_8039D9C8

`HSD_Generator* hsd_8039D9C8(void)`

Allocation failure leaves manager list/count/ID untouched. Success clears storage and updates counts; empty list becomes head, absent/terminal cursor inserts after head, otherwise inserts after cursor->next. Published object gets next ID before resource initialization.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L310-L351

### hsd_8039DAD4

`f32 hsd_8039DAD4(HSD_Generator* gen)`

Below1 returns immediately. Shape dispatch consumes one floating count unit per iteration, including failed particle allocation or absent custom callback. Parent basis excludes kind0x30000, not comment0x3C000. Independent column normalization and billboard unnormalized crosses are not orthonormalization. Shapes0/3/4/6/7 radial;1 line;2 encoded tornado;5 rectangular;8 spherical. Negative-angle phase stepping is ignored by sphere. Sphere consumes union speed and latRange but ignores stored centers/lonRange. Invalid floating values, out-of-range casts, zero denominators and callback mutation have no local guards; large floats can fail to decrease.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L358-L963

### hsd_8039EE24

`void hsd_8039EE24(u32 mask)`

Drains pending bake nodes before any mask test; bakes then frees node and unrefs/clears JObj. Active skip is mask bit(linkNo+16) or kind0x800. Eligible nodes follow transform, accumulate deterministic -random or random*Randf, attempt emission, then decrement nonzero genLife and request retirement at zero. genLife0 is unlimited. Deferred retirement resets life1 for a later eligible pass.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L965-L1020

### hsd_8039EFAC

`HSD_Generator* hsd_8039EFAC(s32 linkNo, s32 bank, s32 gfx_id, HSD_JObj* jobj)`

Base constructor first, then stores optional JObj, retains it when present and ORs0x500 for kind0x20000 else0x700. Base failure returns NULL. Final constructor hooks run before wrapper attachment.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L1022-L1038

### hsd_8039F05C

`HSD_Generator* hsd_8039F05C(s32 linkNo, s32 bank, s32 idx)`

Upper-only signed checks bank<65, link<8, idx<psCmdListArray[bank]; negative bank/index and uninitialized resource tables remain unsafe. Allocates/publishes before copying template fields, initial count, palette and aux variants. Kind0x20000 requests AppSRT but failure still returns generator. Shape custom hook and final hook can mutate already-published object. Header and source have exact same function types.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L1042-L1224

### hsd_8039F6CC

`HSD_Generator* hsd_8039F6CC(s32 linkNo, s32 bank, s32 gfx_id, HSD_JObj* jobj)`

Base construction and JObj retention/type flags match EFAC, then a separate SList node requests next-pass bake/detach. Helper inserts after current anchor and asserts allocation. Queue does not retain generator independently and retirement does not remove pending bake references. Caller lifetime discipline must keep queued generators alive until drain.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/generator.c#L1226-L1244

## Geometry Checks

The source normalizes each JObj basis column separately, preserving possible shear angles. Billboard look/up are normalized before two cross products, but those cross-product axes are not normalized. No zero-vector or camera-up failure guard supplies a general orthonormal result. The actual parent-orientation exclusion mask is0x30000. The nearby comment says0x3C000 and is not authoritative.

Radial cases0/3/4/6/7 share radius/azimuth formulas; negative radius selects fixed magnitude. Cases3/4 use sqrt random radius, case3 also scales velocity, case6 tapers XY with sampled height and case7 does not taper. Line1 scales the endpoint by one random fraction and transforms velocity separately. Tornado2 encodes azimuth and radius fraction into velocity slots and orientation into trailing parameters; speed occupies the first aux word. Rectangle5 snaps axes according to flags, including mixed-face weights, before aux-matrix transformation. Weight denominators and zero Z-axis length are unguarded. Sphere8 uses sqrt-random polar/radius sampling, not proven uniform-area or uniform-volume distribution. Union layout maps cone.height to sphere.latRange and rect.x to sphere.speed; stored angular centers and lonRange are not read by this branch. Radius zero with negative sphere speed divides zero by zero.

## Ownership and Source Boundaries

Generator allocation publishes nodes before constructor hooks; attachment wrappers run afterward. SList allocation adds after its anchor rather than at tail. The separate SList contains borrowed generator pointers and is drained before masks, so retirement of a queued generator would need external lifetime coordination; this review found no local queue removal in retirement and did not reproduce a stale-pointer execution. Child hooks and AppSRT free callbacks can execute during cleanup; saved next pointers do not prove reentrancy safety.

The setter stores an opaque pointer into typed HSD_PSUserFunc storage. The effect library supplies a three-entry void-returning vector while the struct calls int-returning functions. These differing function types require a target-specific boundary; matching storage shape does not establish portable C call compatibility. Particle deletion also accesses cast-derived aggregate storage. Source review describes intended list operations without claiming compiled placement or portable behavior across those assumptions.

## Proposal Decision

All 24 correction writes and one alias clear are supported. The corrections distinguish requests from guaranteed removal, source count from successful particles, pending bake work from persistent active generators, and normalized columns from pure rotation. The alias clear rejects treating a compiled section as a named source allocator object; no replacement section layout is asserted. Two optional clarifications in proposal-review.json cover callback/count progress assumptions and borrowed pending-generator lifetime. Neither requires changing the accepted proposal.

Exact link rationale is rejected for both guaranteed-all-removal relations and the persistent-static-list relation. Five compiled-section associations remain unresolved. Other concept associations are retained with their ordinary valid-input scope; they are not runtime safety guarantees.

No source, shared KB, matching, Git, scheduler, UI, publication or non-dry-run apply work performed.

{"owned_lines": 1286, "subjects": 50, "function_targets": 16, "section_targets": 7, "parameters": 26, "baseline_facts": 119, "facts_by_disposition": {"retain": 66, "supersede": 24, "reject": 1, "unresolved": 28}, "baseline_links": 23, "links_by_disposition": {"retain": 15, "reject": 3, "unresolved": 5}, "reviewed_proposal_operations": 25, "accepted_operations": 25, "required_corrections": 0}
