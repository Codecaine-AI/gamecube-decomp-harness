# hsd_3915 Review Draft

Status: draft pending independent review. Dry-run accepted 66 facts, rejected 0 and skipped 0. No shared knowledge or source changes.

Started: 2026-09-08T15:31:42.329Z. Completed: 2026-09-08T15:37:22.598Z. Elapsed: 340.27 seconds.

Reviewed all 579 canonical and rendered lines across the C file and header, 68 manifest subjects and 66 inherited facts. Retained 37 facts and superseded 29. Retained six name hypotheses; proposed no new names, facts or clears. Reviewed 21 baseline links, retaining 13, rejecting seven and deferring one with exact records preserved.

## Findings

- Current ownership is low-level GX and software drawing. Registry/compositor and timing/configuration ownership moved to hsd_3924 and hsd_392A. Six stale parameter locators require identity followup.
- hexval returns zero for ASCII digits. Short string escapes can read past NUL. Gradient segments use one color at both endpoints, and tick vectors are not generally perpendicular.
- Software glyph loops draw 11 columns despite the header's 12-pixel wording. Fully-left glyphs with x below -11 can select the full destination width and overread glyph source data.
- The stroke atlas contains 47 thirteen-byte records and five remaining bytes. Existing objects show a 7168-byte bitmap atlas. debug_font.inc lacks an owner in the inspected manifest and needs a separate asset review.

## Evidence

Pinned revision: c302741689bd67c361cd7faadb221df3193992c3.

Proposal SHA-256: 147565b65829965004bcd49def6360f601d558cd59d078dd93ed01c1c6e2c161.

Compiled evidence SHA-256: 5acbb1aba0babcacfacc0442b0787e6ed3797cba052928ea3cca0a967055b7ab.

Report SHA-256: dc38bdb51205241c2b638f057f8e34d932bbfafcff7c404170689aeb89585998.

Exact fact versions, canonical citations, link dispositions, unresolved identities and object details are in the companion JSON files.
