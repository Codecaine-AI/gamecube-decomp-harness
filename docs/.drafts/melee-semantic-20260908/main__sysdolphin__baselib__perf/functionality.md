# Baselib Performance Instrumentation

Local research complete; independent review and application pending. Revision `c302741689bd67c361cd7faadb221df3193992c3`. All six functions, four section targets, TU entity and one parameter entity were reviewed.

## Operations

| API | Behavior | Evidence |
|---|---|---|
| HSD_PerfInitStat | Copies CurrentStat to LastStat, then zeroes CurrentStat; does not reset baseline. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.c#L13-L17` |
| HSD_PerfSetStartTime | Overwrites shared s64 start_time with OSGetTime. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.c#L19-L22` |
| HSD_PerfSetCPUTime | Overwrites cpu_time from elapsed ticks since latest baseline. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.c#L24-L28` |
| HSD_PerfSetDrawTime | Overwrites draw_time using the same baseline. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.c#L30-L34` |
| HSD_PerfSetTotalTime | Overwrites total_time using the same baseline. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.c#L36-L40` |
| HSD_PerfCountEnvelopeBlending | Asserts n < 32 and increments env_blend[n]. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.c#L42-L46` |

The owned header also defines HSD_PerfCountMtxLoad, an inline increment of nb_mtx_load with no standalone KB identity. It is covered by the TU and storage facts. HSD_PerfStat contains three f32 times, a u32 matrix count and 32 u32 envelope bins. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/perf.h#L6-L27`.

## Timing Units and Boundaries

Each sample is `(OSGetTime() - start_time) / (f32)(OSSecondsToTicks(1) / 60)`. The denominator is integer-divided before the float cast. OSSecondsToTicks derives from the bus-clock timer frequency; the result is in nominal 60 Hz interval multiples, not milliseconds or percent. `code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os.h#L70-L84`. OSGetTime checks the upper time-base word around the lower-word read to obtain a coherent timestamp. `code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSTime.c#L14-L30`.

CPU, draw and total are cumulative elapsed samples from the same most recent baseline. None advances that baseline or subtracts the preceding sample. There is no baseline-validity or denominator guard in this TU.

The main loop resets start_time inside its queued-update loop and overwrites CPU time on each update. Rendering happens after that loop, then draw and total samples are taken using the latest baseline. Total follows asynchronous XFB-copy submission and pending screenshot work, and immediately precedes record rotation. Thus the last sample is not necessarily the duration of the entire outer iteration or completed display transfer. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L295-L375`.

## Counters and Snapshot State

The envelope counter takes signed n but checks only n < 32. Negative n passes the assertion while violating the intended array-index contract. Valid increments use u32 counters and wrap; there is no saturation or locking. Reviewed PObj and fighter callers initialize the count to zero for a full-weight fast path, otherwise count influence nodes. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1140-L1179` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L247-L278`.

InitStat uses a structure assignment followed by memset. This sequence preserves the completed current record under ordinary sequential use, but is not an atomic publication guarantee. Calling it twice without instrumentation replaces LastStat with zeros. Timing baseline survives rotation. Work counters and latest timing samples can cover different portions of an outer iteration when multiple queued updates occur.

## Data and Compiled Evidence

| Section | Contents | Evidence Limit |
|---|---|---|
| .data | LastStat then CurrentStat, 0x90 bytes each; 0x120 total | Both inspected objects agree on zero bytes and symbol placement. |
| .sbss | Eight-byte start_time scalar | Retain inherited start_time section identification. |
| .sdata | perf.c and n < 32 assertion labels | Existing target/generated padding differs, sizes 16/15. |
| .sdata2 | Double bits 0x4330000000000000, value 2^52 | Existing assembly loads it for unsigned tick-denominator conversion. |

The assembly converts the signed elapsed value through __cvt_sll_flt, then derives the unsigned denominator from bus clock, builds a double with the 0x4330 prefix, subtracts the 2^52 bias and divides. The source normalization and compiled-support interpretation agree. Exact object/assembly SHA-256 hashes and section bytes are in `compiled-artifacts.json` and section proposal rationales. No rebuild, freshness or binary-parity claim is made.

## Naming and Coverage

All canonical function names are retained. The only inherited inferred name is the section-level start_time identifier, corroborated by canonical declaration and object symbol placement; it remains useful and is retained. No new aliases or clears are proposed.

Canonical/rendered C1–47 and H1–30 reach EOF with status ok, zero parser errors and zero substitutions. The owned inline has no KB identity and is explicitly accounted for rather than creating an unauthorized target. All 50 facts have IDs, updated_at versions and dispositions: 27 retained, 23 superseded. The 52 writes refresh those facts, add CPU state behavior and describe the histogram parameter.

Foreign timing primitives, caller scheduling and envelope payload types remain bounded dependencies. No source, shared KB, builds, matching, UI or Git publication actions occurred. Exact proposal hash, timestamps and pending review are in `summary.json`.

## TU Lead Verification

Complete canonical and rendered C1–47/H1–30 and all52 proposal slots reviewed. File-level mapping narrowed to latest queued-update baseline rather than guaranteed full-frame duration. Final SHA `50b9141acc1e95a0651aae0581985dd3dc8193136f30cae9b4eed546d3100980`. [Lead receipt](lead-verification.json). Independent gate pending.
