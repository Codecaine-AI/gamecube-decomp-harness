# File Loading Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Research started 2026-09-08T14:34:38.965Z; completed 2026-09-08T14:37:38.928402+00:00. All three owned files were read canonically and rendered to EOF.

## lbFile_8001615C

Completion callback rejects cancellation and sets the shared latch; its first three arguments are unused.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L14-L20.

## discIsDone

Calls runtime service before returning the completion latch. waitForDisc polls at least once and has no timeout.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L22-L41.

## lbFile_800161C4

Clears the latch, forwards all six low-level transfer arguments to DevCom, and waits for its callback.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L43-L49.

## lbFileGetFullName

Uses shared 32-byte storage; preserves a nonempty extension, uses current language for a trailing dot, and saved language for no dot. Its bounds check is incomplete.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L51-L90.

## lbFile_8001634C

Disables interrupts, opens by DVD entry, copies file length, closes and restores the prior interrupt state; open failure asserts.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L92-L107.

## lbFileGetSize

Completes the filename, resolves its DVD entry, asserts on -1 and queries exact length.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L109-L117.

## lbFile_800164A4

Writes exact length but transfers a rounded-up multiple of 32 from offset zero. Destination address selects type 0x21 or 0x23; forwards caller priority and completion callback.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L119-L129.

## lbFile_80016580

Resolves a basename and submits the whole-file helper at priority 1, without polling.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L131-L142.

## lbFile_8001668C

Loads into caller storage and waits using the shared latch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L144-L149.

## lbFile_80016760

Queries exact size, allocates rounded storage from heap 0, issues a second name/size resolution through the async helper, and waits.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L151-L164.

## lbFile_800168A0

Returns true for a preload hit, otherwise allocates on the requested heap and waits before returning false. Required-preload assertions can prevent fallback.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L151-L177.

## State and Dependencies

The synchronous paths share one flag named cancel and one completion callback. There is no per-request identity comparison in the callback. The filename builder shares one static buffer, so callers cannot retain independent results across later calls. Asynchronous paths have no wait loop, but first query metadata and call the DevCom request routine; they are not asserted to have constant latency.

DevCom requires source, destination and size to be 32-byte aligned and size to be nonzero. The whole-file helper rounds the byte count, not the destination. A zero-length file therefore reaches DevCom's nonzero-size assertion. The allocation helper can return NULL and lbfile adds no local allocation-result check.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L14-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L119-L177, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/devcom.c#L384-L442, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbheap.c#L186-L209.

## Filename Bounds

The prefix guard checks pos > 28 before copying. A 28-character bare name passes but needs 33 bytes including the appended dot, extension and terminator. Existing extensions use strcpy with no total-length check. The inherited blanket statement that overlong basenames assert did not capture these paths. This review records behavior and makes no source fix.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L51-L90.

## Sections

Existing source-object symbols place result[32] in .bss and a four-byte cancel in .sbss. .data contains diagnostics; .sdata contains NULL, usd, dat and 0 strings. The length constants visible in source are not serialized integer members of observed .sdata. Source .sdata is 18 bytes and target .sdata is 24 bytes including padding. Both object snapshots are hashed without rebuilding; exact build provenance remains unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L14-L20 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L51-L115, supplemented by src-object-evidence.txt and obj-object-evidence.txt.

## Consumers

Preload scheduling submits the asynchronous entry-number helper. Archive loading uses the synchronous caller-buffer helper before DAT initialization. THP setup calls THPInit before the allocated load, then initializes decoding context and decodes. Fighter data setup requests preload-or-allocation and explicitly checks the returned pointer before deriving entry pointers. lbDvd_8001819C can assert on a required preload miss before returning control for fallback.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbdvd.c#L278-L294, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L58-L74, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_01F8.c#L84-L112, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1655-L1683, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbdvd.c#L462-L472.

## TU Lead Verification

Complete canonical and rendered source reviewed. Checked completion latch, no-timeout wait, filename overflow boundary, 32-byte transfer rounding and provenance Boolean. Foreign claims remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending. Canonical and rendered snapshots are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbfile/pages/`.

## Current Application Status

Root completed reviewed live KB promotion for 51 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbfile/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbfile/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/f75c1317b65fb5e258dc385e6257bb2470ccdebefdeba6572d5d992edd5c7756/2026-09-08T14-46-11.360Z-995e45c2-c8e1-4b53-90d8-68a0a9b6cca2.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbfile/final-render.json).
