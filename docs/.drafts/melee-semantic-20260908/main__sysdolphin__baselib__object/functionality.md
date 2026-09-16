# main/sysdolphin/baselib/object

Status: TU synthesis complete; independent root review pending.

# Base HSD Object

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered C10/H122 fully read. UTC research 2026-09-08T15:12:15.764606+00:00 to 2026-09-08T15:13:33.798838+00:00.

## Descriptor Initialization

The sole report function ObjInfoInit is void(void), with no parameters or local guards. hsdObj is canonically HSD_ClassInfo with the static InfoInit callback installed and remaining aggregate state zero-initialized. It derives from hsdClass using library sysdolphin_base_library, class name hsd_obj, sizeof(HSD_ObjInfo), and sizeof(HSD_Obj). ObjInfoInit adds no method overrides or direct reference-count initialization. HSD_ObjInfo wraps HSD_ClassInfo without additional members. HSD_Obj embeds HSD_Class plus two u16 reference counters. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.c#L3-L9; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L60-L72; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.h#L14-L39.

ObjInfoInit unconditionally delegates to hsdInitClassInfo: flags become 1, labels, sizes and parent are set, children/sibling links and counters are cleared, the parent initializes if needed, compatible extents are asserted, inherited dispatch data is copied, and hsdObj is prepended to the parent child list. ObjInfoInit itself has no already-initialized guard. ClassInfoInit normally provides that guard; repeated direct calls can clear descendant links and, when hsdObj already heads the parent list, make its next link point to itself.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L22-L58.

FogAdjInfoInit is a verified derived-class example using hsdObj. No source edits or proposed renames are needed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L248-L253.

## Header Reference Operations

ref_DEC requires nonnull input. Sentinel 0xffff returns true unchanged. Otherwise it post-decrements and compares the OLD count with zero: 0 becomes 0xffff and returns true; 1 becomes 0 and returns false. It does not release or destroy an object itself. This is not conventional decrement-to-zero behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L81.

ref_INC alone accepts null. Nonnull inputs increment the u16 field and then assert the NEW count is not 0xffff. Thus 0xfffe increments to the assertion value, whereas an existing 0xffff wraps to zero and passes that particular assertion. ref_CNT maps sentinel to int -1 and returns other counts as int; neither it nor ref_DEC guards null. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L83-L98.

iref_CNT returns the individual u16 count as int with no null guard. iref_DEC returns true at zero without changing it; otherwise decrements and returns whether the NEW value is zero. iref_INC increments and asserts the NEW count is nonzero, catching wraparound after mutation. Both individual mutators require nonnull input. None invokes class lifecycle methods. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L100-L119.

## Types and Coverage

HSD_Type assigns AOBJ through CBOBJ consecutive values 1-16 and HSD_MAX_TYPE 17. MASK_OF uses 1 << (type-1), and ALL_TYPE_MASK is 65535 for those sixteen categories; the macro does not validate arbitrary values. Object access macros are casts/member paths without runtime type checking. Six header inline helpers lack report targets and are inventoried in coverage.json. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L11-L58.

All 16 inherited facts reviewed: eight section facts unresolved; six retained; two state corrections proposed. Section evidence does not prove the full .data/.sdata payload or string pooling. Canonical hsdObj remains the source name; its inherited section alias is not promoted to verified layout. No source/shared KB writes, matching, Git, UI, or publication.


## TU independent review

Owned C10/H122 lines fully independently reviewed canonically and separately rendered, zero errors/substitutions. Static hsdObj installs ObjInfoInit; the initializer has no local idempotence guard. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.c#L3-L9`.

Foreign canonical-only class22-58 confirms ClassInfoInit guards initialization, while hsdInitClassInfo unconditionally clears links/counters and prepends the descriptor; direct repeated calls can create self-link. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L22-L58`.

Six source-only header helpers reviewed. ref_DEC returns true for sentinel without decrement, otherwise tests old zero after postdecrement (zero wraps to65535). ref_INC checks NULL then increments before sentinel assertion. iref_DEC returns true at old zero without decrement, or when decrement reaches zero; iref_INC increments before asserting nonzero. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L119`.

Header u16 count fields and type-mask enum fully reviewed. All16 baseline facts reviewed:6retain2supersede8unresolved. Compiled data/section identity not inferred from declarations. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L18-L72`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
