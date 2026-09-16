# Time and Counter Helpers

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical/rendered C1-67 and H1-16 reviewed to EOF. Research started 2026-09-08T14:39:51.061Z; completed 2026-09-08T14:41:58.090317+00:00.

## Arithmetic Entry Points

lbTime_8000AEC8 adds two u32 operands and saturates at 0xFFFFFFFF. Its strict comparison chooses the saturation branch at equality, but the numeric result is still the exact endpoint. Neither the body nor the inspected caller gives that value a separate error meaning.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtime.c#L5-L8.

lbTime_8000AEE4 applies a signed delta to a u32 value, clamping at zero or 0xFFFFFFFF. AF24 and AF74 apply corresponding checks to the low 16 or 8 bits. They return full a+b on the arithmetic branch, so they are not generic narrowing clamps for arbitrary u32 a. All three signed-delta helpers evaluate -b for nonpositive b. Negating INT_MIN overflows signed int in portable C; no compiled behavior is inferred here.

For AF24, a=0x10001 and b=1 returns 0x10002, while a=0x10000 and b=0 returns zero. These are direct evaluations of the canonical branch expressions. The same distinction applies to AF74 with an 8-bit mask. No runtime test or source patch was performed.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtime.c#L10-L52.

## Clock Entry Points

lbTime_GetTimeInSeconds reads OSGetTime, divides ticks by OS_TIMER_CLOCK, stores the result as u64, caps values greater than UINT_MAX and returns u32. lbTime_8000B028 widens unsigned seconds to u64, multiplies by OS_TIMER_CLOCK and delegates to OSTicksToCalendarTime with the caller's output pointer. OS_TIMER_CLOCK is bus clock divided by four. The calendar routine writes fractional-second and date/time fields through that pointer. No epoch or timezone claim is added.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtime.c#L54-L66, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os.h#L75-L84, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSTime.c#L156-L192.

## Consumers and State

The unsigned adder appears in post-match accumulation of standing x50 fields plus persistent x10 before threshold 1000000. The 32-bit signed-delta helper folds 25 saved xB0 entries before threshold 500000 and progression ID 0x8D. The 16-bit helper receives a score delta derived from selected ItemKind cases and updates unk_2E for argument zero. The byte helper updates match state, Home-Run and Multi-Man counters, and an indexed central-state counter. External record labels and trophy names remain deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1736.c#L176-L193, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1736.c#L279-L309, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/plbonuslib.c#L1382-L1430, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L446-L463, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain_lib.c#L734-L738, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhomerun.c#L69-L91, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmultiman.c#L249-L275.

The arithmetic functions mutate no state. The clock reader uses external OS state; the calendar wrapper writes caller-owned output. This TU declares no mutable globals and has no section targets in its frozen inventory. Ten parameter entities have no baseline facts. Every existing fact receives an ID/timestamp-hash disposition in coverage.json.

## TU Lead Verification

Complete canonical and rendered source reviewed. Checked strict saturation endpoint comparisons, low-bit tests versus full-word arithmetic, signed INT_MIN negation limit and delegated calendar conversion. Foreign progression labels and OS internals remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending. Snapshots are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbtime/pages/`.

## Current Application Status

Root completed reviewed live KB promotion for 27 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbtime/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbtime/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/6f50591f2a3ff516743b2e2ba403f8eda43e9c5f820d896173faa31437c42e05/2026-09-08T14-51-20.298Z-5924f297-1e8f-4d92-831b-622edc30a378.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbtime/final-render.json).
