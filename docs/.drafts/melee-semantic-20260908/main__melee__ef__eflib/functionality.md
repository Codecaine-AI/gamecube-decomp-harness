# Effect library semantic review

Reviewed all canonical and rendered pages of `eflib.c` and `eflib.h`, all 153 frozen subjects, all 238 facts, and all 30 links. Baseline dispositions are saved in checkpoints; unchanged knowledge was retained explicitly rather than rewritten.

## Responsibilities

The library creates descriptor-backed model effects, attaches and configures particle generators, maintains owner-scoped effect lifecycle operations, and bridges GObj processing/rendering to the particle system. Model effects contain an `EF_Effect` user-data record, a model JObj, common update processing, and optional effect-specific callbacks. Creation indexes model descriptors using quotient/remainder by 1000; generator factories generally pass the full graphics ID alongside its quotient-derived bank.

Initialization establishes the effect allocator, resets the counted population and first 50 data pointers, registers particle callbacks, creates two particle-manager GObjs, initializes AppSRT and the asynchronous queue, and resets eight parameter-owner keys and alpha defaults. It does not establish that every other global or payload field is reset.

## Lifecycle and numeric state

Owner-wide operations traverse both effect-bearing GObj lists. Single-effect destruction accepts only records with `is_async == 0`; owner-wide destruction has no equivalent restriction. The source load constants call zero `EF_LOADKIND_ASYNC` and one `EF_LOADKIND_SYNC`, so intuitive interpretations of the `is_async` field are unsafe. Capacity accounting and eligibility should be described numerically.

`efLib_Update` switches on the complete state byte. Exactly 1 becomes 2 and still performs that invocation's ordinary work; exactly 2 returns immediately. Values containing the preserved 0x80 bit do not match those cases. Nonzero lifetime decrements before scale, animation, and callback processing; reaching zero requests GObj removal and returns. Scale inheritance takes the attachment's effective Y scale and broadcasts it across the effect's axes. Animation precedes the custom callback.

Removal is not universally immediate: the GObj removal routine can defer deletion of the current processing object, and generator cleanup can retain generators while dependent particles or shared AppSRT users remain. Constructor failures also do not provide uniform rollback: the counted population is incremented before effect allocation, and the GObj-creation failure branch encounters its duplicate-free assertion after assigning a null GObj.

## Attachments, transforms, and callbacks

Attachment constructors distinguish owner identity, attachment JObj, initial translation, and initial owner-root Y scaling. The `AttachChild` variant adds an RObj constraint through `lb_8000C290`; it does not insert the effect root into the target's child list. Position-only creation does not establish a JObj attachment. The generator-backed position wrapper returns an `EF_Effect`, retains it even if generator setup fails, and installs a callback that recomputes attachment-derived position plus a fixed copied offset—not cumulative displacement.

Generator AppSRT helpers reuse existing records or allocate missing ones. Pointer-valued variadic direction and scale arguments are consumed only after successful creation. Existing transforms must not be assumed to be identity. Particle AppSRT replacement snapshots translation, rotation, and scale, releases the old reference, and restores those values into a fresh record; allocation failure writes zero size, zero command wait, and life 1.

Effect callbacks implement absolute facing rotations, multiplicative scaling, additive motion, terminal lifetime transitions, material alpha application, and move-specific visibility/slope presentation. Mario/Luigi slope guards read an s32 representation word; Bowser's guard explicitly converts x10 to s32. Numeric motion comparisons remain distinct from unverified grounded/aerial mappings.

## Particle dispatch and rendering

Exceptional graphics-ID cases terminate after their specialized attempt, including failures, rather than falling through to a generic spawn. ID 0xE3 takes position from the supplied joint and scale from its root. Generic dispatch forwards the original joint despite the local variable being named `root`.

Processing masks exclude links, whereas rendering masks include links. Main processing excludes links 1 and 2; auxiliary processing excludes link 0. This is complementary for links 0–2, not a proof that higher links cannot run in both passes. Generator pending-list processing occurs before its mask checks. Rendering accepts only codes 0–2, enables color updates, and renders groups 0 and 2 for GX link 7 or group 1 otherwise.

## Parameter storage and evidence limitations

The eight-entry owner-keyed parameter cache updates an existing key before taking the first free slot and silently returns when full. Cleanup clears keys without resetting payloads. Graphics ID 0x417 redirects alpha to the second texture; 0x419 additionally updates six sibling JObjs. Canonical guard code confirms non-Yoshi light-shield alpha production.

Source declarations and deliberate cross-array indexing do not prove compiled BSS adjacency, section extent, alignment, or emitted floating-point pool contents. Those baseline claims remain unresolved. The rendered C view reports 12 parse errors and includes parse-uncertain and shadowed bindings; the header reports zero parse errors. Rendered names were treated as hypotheses. In particular, the rendered child-constraint wording cannot establish reparenting.

Status: researched; no-change lead bypass; independent review and live promotion pending.
