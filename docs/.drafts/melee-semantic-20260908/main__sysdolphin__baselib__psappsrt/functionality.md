# main/sysdolphin/baselib/psappsrt

Status: TU synthesis complete; independent root review pending.

# AppSRT Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Started 2026-09-08T15:04:54Z; ended 2026-09-08T15:07:23Z. Complete canonical and separate rendered reads cover C1–133 and H1–26. Both render successfully with zero errors/substitutions. All 28 writable subjects and 62 facts reviewed. Dispositions: {'unresolved': 26, 'supersede': 4, 'retain': 32}.

## Functionality

Creation initializes scalar/component fields and use count1. Begin wrappers install a newly allocated record without releasing existing attachment. Attach wrappers share an existing record only with an empty owner slot. Both removal paths detach and free on exactly zero remaining count; only generator removal conditionally clears the record generator back-reference.

### `psInitAppSRT`

`bool psInitAppSRT(int num, int size)`

Ignores num, zeros live/peak counters, stores low16 bits of size in local size slot, passes original size and alignment4 to allocator initialization, returns false. No size validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L12-L19.

### `psAddGeneratorAppSRT`

`HSD_psAppSRT* psAddGeneratorAppSRT(s32 status, u16 idnum)`

Allocates from AppSRT descriptor. Failure returns NULL without counter writes. Success zeroes HSD_PSAppSrt_804D7958[0] bytes of allocated storage, initializes next/gp/freefunc NULL, usedCount1, frameNum0, xA2 zero, stores supplied idnum without narrowing and status narrowed to u8. Writes translation XYZ and rotation XYZ zero, scale XYZ one. Increments live counter and raises peak if exceeded. Does not attach an owner or prove cached matrices/quaternion identity.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L21-L53.

### `psAddParticleAppSRT_begin`

`HSD_psAppSRT* psAddParticleAppSRT_begin(HSD_Particle* pp, s32 status)`

Requires particle pointer, calls allocator with status and particle idnum, unconditionally overwrites particle appsrt with result, including NULL. Does not release an old attachment or increment count beyond allocator initial1.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L55-L58.

### `psAddGeneratorAppSRT_begin`

`HSD_psAppSRT* psAddGeneratorAppSRT_begin(HSD_Generator* gp, s32 status)`

Requires generator pointer, calls allocator with status and generator idnum, unconditionally overwrites generator appsrt with result, including NULL. Does not release old attachment or set srt->gp back-reference.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L60-L63.

### `psAttachParticleAppSRT`

`int psAttachParticleAppSRT(HSD_Particle* pp, HSD_psAppSRT* srt)`

Rejects null pointers or occupied particle slot with -1 and no mutation. Otherwise assigns srt, pre-increments u16 usedCount and returns resulting stored count promoted to int. No overflow guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L65-L72.

### `psAttachGeneratorAppSRT`

`int psAttachGeneratorAppSRT(HSD_Generator* gp, HSD_psAppSRT* srt)`

Rejects null pointers or occupied generator slot with -1 and no mutation. Otherwise assigns srt, pre-increments u16 usedCount and returns it promoted to int. Does not set srt->gp. No overflow guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L74-L81.

### `psRemoveParticleAppSRT`

`int psRemoveParticleAppSRT(HSD_Particle* pp)`

Requires particle pointer. Missing attachment returns -1. Otherwise pre-decrements u16 count; at zero invokes optional freefunc while owner slot still points to srt, then frees using allocator and decrements live count. Clears particle slot after cleanup and returns count. No underflow guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L83-L103.

### `psRemoveGeneratorSRT`

`int psRemoveGeneratorSRT(HSD_Generator* gp)`

Requires generator pointer. Missing attachment returns -1. Clears srt->gp only if it equals this generator, decrements u16 count, and on zero invokes optional freefunc then allocator free and live-count decrement. Clears generator appsrt after cleanup. Does not protect reentrant cleanup or count underflow.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L105-L132.

## Header and Type Review

All eight public prototypes match C. Header defines unnamed flag bits9,10,11 and exports HSD_PSAppSrt_804D10B0. No meaning for those bits is proved by this TU. The source declares static u16 size slots[4] and allocator metadata; only slot0 is read/written here. Those authored declarations are documented without claiming complete section mapping.

Foreign canonical psstructs.h lines91–126 declares Quaternion rot, Vec3 translate/scale, u8 status/frameNum, u16 usedCount/idnum and void (*freefunc)(HSD_psAppSRT*). These support local function semantics; generic particle structures remain family-owned. The code sets only rot XYZ explicitly after configured memset; it does not establish quaternion identity or initialize a matrix to identity.

Use counts can wrap: attachment at65535 stores0, removal at0 stores65535. The functions do not reject either case. Begin wrappers also overwrite old attachments even on allocation failure. Cleanup callback executes before owner appsrt is cleared. These observations constrain broad lifecycle wording.

All canonical names are retained. No source-only functions are missing from the report. Parameter types and roles are individually recorded, with 14 empty baseline entity fact sets. The 62 baseline fact IDs and update timestamps are preserved; integer versions are not exposed by the helper.

No object/map evidence was read for .bss, .sbss, .sdata2, extab or extabindex. Those 19 section facts remain unresolved. Allocator internals and transform consumers remain foreign followups. No source or shared KB changes occurred.

Dry-run valid: 4 accepted, 0 rejected. Proposal SHA-256 `94c0a7c262d525f74f4b8a6670baa34f2f6d4a7a7f579e5c720e941c463a4c08`.


## TU independent review

Owned C133/H26 independently read canonical and rendered without parse errors/substitutions. All62 baseline facts and4 proposals reviewed. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L1-L133`.

Constructor clears only the stored u16 size, while allocator receives the full size. No minimum-size guard precedes explicit field writes. num is unused. Both begin wrappers overwrite existing attachment, including with NULL on allocation failure. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L12-L63`.

Foreign canonical-only psstructs.h91-126 confirms statusu8, usedCountu16, frameNumu8 and Quaternion rot. Constructor explicitly writes only rotation XYZ; no quaternion identity is established. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L91-L126`.

Attach rejects null pointers and occupied slots but has no count-overflow guard: maxu16 increments to zero. Removal underflows zero to65535 and calls cleanup before clearing owner slot, so callback reentrancy/owner mutation is not handled. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L65-L132`.

TU additionally defers unqualified rotation-zero constructor claim and two attachment count-increase state claims; source explicitly supports XYZ stores and u16 modular counts instead. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psappsrt.c#L21-L80`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
