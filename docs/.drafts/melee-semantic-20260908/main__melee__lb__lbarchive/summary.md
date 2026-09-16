# `lbarchive` Review Summary

Local research is complete. Independent review and application are pending.

Started UTC `2026-09-08T14:33:02.661Z`. Completed UTC `2026-09-08T14:38:31.412971+00:00`. Elapsed research time 329 seconds.

| Coverage | Reviewed / Expected |
|---|---|
| Owned files | 2 / 2 |
| Canonical lines | 345 / 345 |
| Rendered lines | 345 / 345 |
| Current targets | 12 / 12 |
| Writable subjects | 36 / 36 |
| Existing facts | 61 / 61 |

All 61 facts have explicit IDs, updated_at versions and retain/supersede decisions in `fact-dispositions.json`. Counts: {'retain': 34, 'supersede': 27}. The 87-operation proposal refreshes those 61 facts, adds 23 parameter-purpose facts and proposes three inferred names. Two inherited inferred names are retained. No clear operations.

Dry-run validation is valid with 87 accepted operations and zero rejected. This is validation, not application. Proposal SHA-256 `3a727a0d1ecc682d5142d4fbddfe1795f59c134262b588fbd090fef1bb97e60c`. Manifest SHA-256 `1b5ad02d910c5ffb667eeca97079b786287ad02a7bb85945fd92865488e6eb9d`.

Read exceptions remain explicit. The C renderer reports 15 parse errors on both pages; header reports zero. Both owned files reach next_line null. Canonical and rendered content was read in full despite variadic parse_uncertain entries and declaration shadowed_binding entries. Immutable page metadata is in `coverage.json`.

The main semantic qualifications are preload lookup assertions before fallback, bounded external-chain guarantees, the explicit relocator's zero top_ptr and unchecked offset assumptions, and release ownership requirements. Existing object diagnostic strings were inspected read-only; their differing small-data padding and hashes are recorded without claiming build freshness or binary parity.

Open review items are listed in `family-followups.json`. The lead should review the exact proposal hash before any staged application. No shared KB, canonical source, UI, compilation, matching or Git publication changes were made.
