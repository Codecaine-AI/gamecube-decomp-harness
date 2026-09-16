# Debug speed and screenshot controls

Pinned `c302741689bd67c361cd7faadb221df3193992c3`. All98 content lines read canonically and in the rendered page; rendered EOF includes a trailing blank line99; no owned header. Render:0 parse errors,3 substitutions; receipts `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__db__dbscreenshot/pages/`.

## Speed controls

Setup clears only the one-bit latch. The unchecked per-player checker tests stored A-held and right-pressed bits and invokes the toggle per qualifying call. The dispatcher refreshes only two slots in the presence of Hand bosses but dispatches all four, so stale masks can repeat. Several controllers can toggle shared state several times in a frame.

The latch selects gm_SetGameSpeed(5.0f) or gm_ResetGameSpeed(). The setter programs ticks for 1/60/speed; reset uses the configured match game_speed, which need not be 1.0. It does not restore a saved pre-toggle speed. Setup only clears b0 and does not update timing.

## Screenshot request and service

Initialization resets pending and sequence. Polling scans all four raw master pad slots for Y-held plus up-trigger, without checking connection or error fields. The game-loop caller gates this poll on DebugRom level; the later service runs without that gate after an asynchronous XFB copy. Multiple requests coalesce.

The service waits through HSD_VIWaitXFBFlush, which skips waiting when fewer than two XFBs exist; otherwise WAITDONE/DRAWDONE/NEXT keep its retrace loop active. Selection checks those statuses followed by DISPLAY under interrupt protection. A missing index reports a diagnostic and invokes the assertion/panic chain. The caller does not pin or copy the selected buffer; it forwards its raw address and fbWidth * xfbHeight *2 bytes.

The unsigned pending flag coalesces all requests. Initialization clears it and resets the signed sequence to zero, potentially discarding a request and reusing filenames. A normal service attempt increments the sequence before formatting and writing, ignores write status and clears pending even after failure. Monotonic numbering is bounded by resets, signed overflow and pathname capacity; no retry or queue exists.

The format has23 fixed characters plus terminating NUL, so the32-byte destination allows8 number characters. The first nine-digit nonnegative sequence100000000 needs33 bytes. `%02d` is a minimum width and sprintf is unbounded. Signed increment is also unguarded.

The adapter accepts a case-sensitive USB: prefix, removes four bytes and returns the FIO service result; otherwise -1. No null/buffer/size validation occurs. The inspected service returns -5 if unavailable, removes one leading slash, opens with0xA02, writes once, closes, and returns requested size or a float-converted write result. Its return is ignored here. No image conversion, compression, headers or write verification is performed by this unit.

## Storage

|Section|Source / target bytes|Payload|
|---|---|---|
|.data|60 /64|Diagnostic, assertion filename, output format|
|.sdata|9 /16|Assertion condition0 and USB: strings|
|.sbss|16 /16|Three ints plus one-byte flag union and padding|
|.sdata2|4 /8|f32 5.0 plus target padding|

Objects were inspected without rebuilding; provenance is unverified. The unused base int remains unresolved.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbscreenshot.c#L1-L98, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L1-L256, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L258-L266, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L312-L378, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L170-L191, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/types.h#L18-L35, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L319-L398, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L19-L38, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.c#L1-L63, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L313-L366.
