# Localized DVD Status Display

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered C/header views are read through EOF, 197 lines total. All seven manifest subjects and 32 inherited facts are reviewed.

`lb_80019230`, lines 89-107, classifies drive status. `lb_800192A8`, lines 112-187, shows the blocking three-line status display with an optional nullary callback. The header exports the display routine through `Event cb`. Both canonical function names remain authoritative; no aliases or new names are proposed.

| Raw Status | Message Index | Display |
|---:|---:|---|
| 5 | 0 | Close Disc Cover |
| 4 | 1 | Insert Melee disc |
| 6 | 2 | Wrong disc |
| 11 | 3 | Unreadable disc |
| -1 | 4 | Power-off error |
| 1 | 5 | Reading disc |

All other raw statuses map to -1. Initial -1 and reading index 5 skip the screen. An active display can show reading index 5. On a later -1, the next iteration leaves the old strings intact, renders, requests XFB copy and calls cb before exiting. This is an unmapped-status exit, not an independently verified successful-media check.

The routine chooses parallel Japanese/U.S. message arrays by saved language. Japanese font dimensions are 0.67/0.75; U.S. dimensions are 0.58/0.70. Alignment and kerning are 1. The three lines use x 0 and y offsets -68,-34,0. Each changed valid index replaces all three lines. Every iteration invalidates GX vertex/texture caches before render.

Entry calls audio bracketing and enables global rumble suppression. Cleanup calls the paired audio service, disables suppression, destroys the text object and sets gmMainLib_8046B0F0.xC true. The static text pointer is not cleared. The callback runs after every screen-copy request, including the final exit iteration; its implementation is outside this TU.

## Resources and Limits

The source attests two six-entry arrays of three line pointers, a static HSD_Text pointer, blank/percent-s strings and layout constants. Physical compiler pooling and section extent remain separate questions. Five inherited section claims and two recovery-specific facts are unresolved with exact IDs and versions. No reentrant callback or allocation-failure guarantee is asserted.

Fact decisions: {'retain': 15, 'supersede': 10, 'unresolved': 7}. Proposed writes: 10. Full evidence, versioned decisions, source hashes, render metadata and followups are in findings.json. No source/shared KB edits, matching, publication or UI startup occurred.

Dry-run passed: 10 accepted operations, zero rejections. Proposal SHA-256 `6d897f028b689565c11ac674e0a21846a5fc5a02c79eac88d70ef95065824bbf`. UTC 2026-09-08T14:40:02.932000+00:00 to 2026-09-08T14:44:16.666338+00:00.

Reviewer correction: two inherited drive-recovery claims are unresolved. Classifier -1 means any unmapped status, including the final render/callback and teardown path. Proposal unchanged.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0192/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0192/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/6d897f028b689565c11ac674e0a21846a5fc5a02c79eac88d70ef95065824bbf/2026-09-08T14-55-31.739Z-f525584c-ea9e-4baf-bdd6-28737eabfe7e.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes preserved.
