# hsd_397E Review

Draft complete; pending independent lead review. No knowledge changes applied.

- Research started: 2026-09-08T15:06:18Z
- Research ended: 2026-09-08T15:09:42Z
- Elapsed seconds: 204
- Coverage: 2 files, 238 canonical and rendered lines through EOF, 4 subjects, 7 inherited facts.
- Proposal: 7 writes, 1 retained and 6 superseded; no new facts, names, or clears.

Dry-run accepted 7, rejected 0, skipped 0. Proposal SHA256: `3b46b2ee98f8376bcdd1c020cbee73839115a6c9211f3187c191489e1b4c054f`.

C rendering reported 138 inline-assembly parser errors and zero substitutions. Full text reached EOF; all 69 register cases were manually inventoried. Header rendering had no errors or substitutions.

Register reads require `MWERKS_GEKKO`. Other builds log the unsupported-selector diagnostic and return zero for every selector. Data evidence distinguishes the 50-byte string object from its 56-byte split allocation. Caller claims are bounded to the observed numeric selector requests.
