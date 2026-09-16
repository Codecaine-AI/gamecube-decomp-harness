# dbscreenshot semantic review

## Scope and naming
The inherited research establishes complete coverage of all 99 canonical and rendered lines, all 16 subjects, all 57 baseline facts, and all 20 links. The lead independently reread the canonical and rendered owned file, every proposed fact's code citations, and the contextual contradiction evidence. The renderer reports no parse errors and substitutes only `fn_802289F8` with `db_WriteUSBFile` at its declaration, call, and definition. That moderate-confidence name fits the canonical prefix-validation and file-output adapter; it is not proof of an original symbol name. No cosmetic renaming is proposed.

## Five-times-speed control
`fn_Setup5xSpeed` clears only `db_5xSpeedStatus.b0`; it does not restore game timing. `fn_Check5xSpeed(player)` tests held A and the stored D-pad-right pressed bit, then invokes the shared toggle. Each invocation of `fn_Toggle5xSpeed` inverts the latch and calls either `gm_SetGameSpeed(5.0f)` or `gm_ResetGameSpeed`.

The external reset routine uses the configured match `game_speed`, not necessarily 1.0 and not a saved pre-toggle speed. Existing references to the normal/reset state are retained in this configured-baseline sense. The debug dispatcher is level-gated and checks all four slots, but refreshes only two slots when Master Hand or Crazy Hand is present. Consequently, fresh-edge behavior is conditional on slot refresh; the checker does not consume its stored pressed bit. Several qualifying slots can toggle the shared latch in one frame.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbscreenshot.c#L16-L38; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L256; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L258-L266.

## Deferred screenshot capture
Initialization clears both the unsigned pending flag and signed sequence number. Polling reads all four master-pad entries directly: held Y plus triggered D-pad Up sets pending to 1. No connection-status test, queue, counter of requests, or clearing on a nonmatching poll is present. Requests coalesce.

The service returns normally without work when pending is zero. Otherwise it invokes XFB flushing, then obtains a slot through a WAITDONE, DRAWDONE, NEXT, DISPLAY priority search. Flushing returns immediately with fewer than two XFBs; otherwise it waits while WAITDONE, DRAWDONE, or NEXT slots exist. Thus the selector's name alone does not prove that every returned buffer is completed in every configuration.

A -1 slot produces `cant find xfb!\n` and enters the assertion path before sequence advancement or pending clearing. The assertion macro calls a declared non-returning `__assert`; its condition text is `0`, and the reported line depends on MUST_MATCH. On the normal path, capture saves the old sequence, increments the global, formats `USB:shot/screenshot%02d.frb` using the old value, and passes the selected buffer address plus current `fbWidth * xfbHeight * 2` to the adapter. It ignores output status and clears pending after the call returns. Numbering therefore counts attempts, not successful files. Initialization can discard requests and reuse names; signed arithmetic and the fixed 32-byte sprintf destination do not support an unlimited monotonic-numbering guarantee.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbscreenshot.c#L40-L98; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L322-L379; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L11-L32.

## Output boundary and lifetime
The static adapter accepts exactly the `USB:` prefix, strips four bytes, and forwards the remaining path, integer-carried buffer address, and byte count unchanged. Unsupported prefixes return -1. The downstream routine checks FIO availability, opens the file, calls FIOFwrite, closes the file on its write paths, and returns an error or size-related result. The screenshot caller does not interpret those results or retry. The local path remains live during this call chain; the XFB remains video-owned, with no allocation, copy, or ownership transfer in this unit. No stronger asynchronous lifetime guarantee is inferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbscreenshot.c#L64-L98; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L313-L366.

## Data and evidence limits
The semantic roles of the string pool, USB discriminator, speed constant, and persistent state remain supported. `db_804D6B88` has no use beyond its declaration in the owned file. Upstream research reports an inspected object artifact with unverified current-build provenance, additional assertion-condition bytes before `USB:`, and a speed-flag boundary inconsistent with four-word simplification. Those observations are retained as research context, not independently validated compiled-layout conclusions. Canonical source independently confirms the assertion condition string and distinct declared state types, but not their compiled placement or extent. Exact section sizes, padding, and object extents remain deferred.

The completed inherited ledger retains 46 facts and all 20 links, supersedes seven factual explanations, and explicitly defers four compiled-layout facts. The lead accepts those dispositions without overrides; archived artifacts are not treated as proof of correctness.

Status: synthesized; independent review and live promotion pending.
