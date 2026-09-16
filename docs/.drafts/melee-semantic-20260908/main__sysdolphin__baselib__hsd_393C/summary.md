# hsd_393C Review

Draft complete; independent lead review pending. Dry-run accepted 60, rejected 0, skipped 0. No application.

- Coverage: 357 canonical/rendered lines through EOF across two files; 26 subjects and 60 inherited facts.
- Dispositions: 32 retained, 28 superseded; eight inherited naming hypotheses retained, no new names or clears.
- Research started: 2026-09-08T15:10:42.724Z
- Research ended: 2026-09-08T15:14:03.194913Z
- Elapsed seconds: 200

Proposal SHA256 `d7ccca5fdcaa345720293fec04874ba1da2316f5f4c02065d3d7cc5b8ccbb031`.

C rendering reported three parser errors, zero substitutions and parse_uncertain names. Header rendering reported zero errors and ten substitutions, including foreign declarations.

Corrections cover the missing cached-length update on positive relative movement, capture versus initialization guards, row-zero fallback behavior, capacity traversal overshoot, stored NUL ambiguity, and XFB caller-storage/NULL requirements. Existing objects independently confirm one 40-byte .bss state object.
