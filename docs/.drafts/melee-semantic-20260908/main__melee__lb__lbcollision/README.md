# `lbcollision` Review Packet

Root independently reviewed and promoted 115 facts to the live KB. Canonical source names and source code remain unchanged.

| Artifact | Contents |
|---|---|
| [functionality.md](functionality.md) | TU behavior, entry points, state and limits |
| [naming.md](naming.md) | Every target, canonical name, inherited/proposed alias and disposition |
| [fact-dispositions.json](fact-dispositions.json) | All 252 existing facts with IDs and timestamp versions |
| [coverage.json](coverage.json) | 44 targets, 165 entities, 2,789 canonical/rendered lines, receipts and hashes |
| [proposal.json](proposal.json) | 115 dry-run-valid fact writes; no entity creation, merging or shared-type writes |

[unresolved.json](unresolved.json) records 29 unresolved facts and family followups. No baseline facts are silently dropped. The one newly proposed function alias is `lbColl_RegisterHitCapsuleVictim1` for `lbColl_80008688`; all other proposed names refresh existing hypotheses. There are no source renames.

The four cluster folders preserve findings, separate coverage records and original proposals. Canonical and rendered page snapshots live in the campaign unit's `pages/` directory. The synthesized proposal includes an additional near-parallel endpoint-heuristic caveat for `lbColl_80006E58`. Root should review that addition alongside the geometry-base caveat for `lbColl_80006094`.

Owned renders have zero parse errors. The supplemental foreign JObj rendered view has three parse errors; its canonical code was read separately. Shared baselib implementation facts remain owned by that family; this proposal only addresses the existing lbcollision target identity.

Dry-run proposal hash: `c6de81a80f0698c45f48b23824f2b784100386008b5c05b5584a97df864ae125`. 115 accepted for validation, zero rejected. Promoted to the live KB by root. Source hashes remain unchanged.
