# Performance Display Data

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned canonical and rendered files were read to EOF, C1-204 and H1-9. Started 2026-09-08T15:06:26.120Z; completed 2026-09-08T15:08:18.079405+00:00. Immutable page artifacts and receipts reside in `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_392A/`.

## Sampling and Peaks

fn_80392934 copies HSD_PerfLastStat CPU, draw and total values. For each channel a larger sample immediately replaces the recent retained value and resets its counter to 60. Otherwise the old counter is tested against zero and post-decremented. Old zero becomes -1 without replacement; old -1 triggers replacement. Thus 62 consecutive updater calls without a larger sample expire a reset counter. This is a sample hold policy, not a sliding-window maximum or a verified one-second timer. The three accumulated maxima update regardless of display enable and reset only through the setter's zero-to-nonzero transition.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L45-L98. Independently read perf.c shows HSD_PerfInitStat copying current to last and time producers dividing elapsed ticks by a nominal 1/60-second interval, so these numbers are frame units rather than milliseconds: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.c#L10-L39.

## Controls

The exact setter is void fn_80392A08(int mode, int scale, int enable). mode defaults to 4 and supplies the graphics divisor; zero disables the four graphic records. scale defaults to 1 but is used as a text flag. enable starts at zero and controls a maxima row nested inside ordinary text. All values are stored without normalization. Repeated nonzero enable preserves maxima, disabling preserves them, and subsequent nonzero enable resets them even if ordinary text remains hidden.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L81-L108, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L124-L197 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.h#L4-L6.

## Reusable List

fn_80392A3C returns void*, either NULL or the static six-item array. Each 0x88-byte item holds a next pointer, signed tag and 128-byte union. Nonzero mode creates one type-1 segmented bar and three type-2 gradients. For positive mode, the bar is one green unit, up to three yellow units, and red overflow beyond four. Count -1 terminates the bar data. Negative mode still enters the branch, creates one green unit and uses a negative divisor.

The gradients describe total, draw and CPU divided by mode. Total has an additional position computed exactly as (f32)(s32)(0.9999F + total) / (f32)mode; this is not universally equivalent to mathematical ceiling. Positions of -1.0F terminate gradient arrays. There is no clamp to the unit interval.

Ordinary text appends one type-0 item with six current/recent values. Accumulated text appends one more only when both text controls are nonzero. Counts are 0, 1, 2, 4, 5 or 6. No output returns NULL; otherwise the last occupied link is NULL. A transient one-past-array pointer can be assigned to the sixth next field before final termination overwrites it. Returned storage is reused on later calls. sprintf is unbounded; the fixed 128-byte payload does not establish safety for arbitrary float inputs.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L12-L29 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L115-L203.

## Section Contents

The .bss target is the six-item 0x330-byte array. .sbss contains nine timing floats, three signed hold counters and one signed enable flag, 0x34 bytes of declarations. Existing target storage is 0x38 bytes with trailing padding. .sdata contains eight signed words, two display controls and six packed colors. .data contains the two printf formats at offsets 0 and 0x58; existing source size is 0x82 and target size 0x88.

The 0x18-byte .sdata2 holds float zero, float 0.9999, float -1, four alignment bytes and double bits 4330000080000000 used for signed integer conversion. Existing object hashes and section dumps are saved; these establish observed artifact contents without verifying that the artifacts were built from the pinned revision.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L12-L43, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L81-L108, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L157-L193 and object-evidence.txt.

## Integration

The neighboring display setup registers this builder and configures 4,1,0. Its draw callback samples this TU before calling the renderer. The independently read renderer invokes registered providers and dispatches type 0 to text, type 1 to bars and type 2 to gradient drawing. Callback type reconciliation remains with the family owner.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3982.c#L11-L16, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3982.c#L40-L54, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L61-L64 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L158-L240.

## Coverage

All 12 subjects and 27 baseline facts have versioned dispositions in coverage.json. Three parameter entities, the TU entity and three initialized-data sections were fact-free. No source or shared-KB changes were made.

## TU Lead Verification

Complete canonical/rendered C1–204/H1–9 and all13 proposed slots reviewed. Countdown expiry, hidden maxima updates, nested text flags, negative graphical mode and static list lifetime confirmed. [Lead receipt](lead-verification.json). Independent review pending.

Review correction: disabling leaves maxima intact in the setter, while later updater calls can raise them. Fact01b46160 superseded;14operations,20retain7supersede. Final SHA `579ad6f517206037180ec76ead9336b6058501846beb20d2dd87ecdfc21ec0db`.

Outgoing relationships were reviewed individually against current canonical evidence. [Exact-record link dispositions](link-dispositions.json) preserve every original record and disposition. Independent link review remains pending.
