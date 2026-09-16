# Fighter Action Review Packet

Root independently reviewed and promoted 49 facts to the live KB.

| Artifact | Contents |
|---|---|
| [functionality.md](functionality.md) | Three interpreter paths, command groups and limits |
| [naming.md](naming.md) | All 80 targets and naming decisions |
| [fact-dispositions.json](fact-dispositions.json) | All 463 facts with IDs and timestamp versions |
| [coverage.json](coverage.json) | 1,439 canonical/rendered lines, 234 subjects and exact UTC timing |
| [proposal.json](proposal.json) | 49 dry-run-valid fact writes |

[unresolved.json](unresolved.json) preserves 80 unverified external extensions and family followups. Decisions are 327 retain, 48 supersede and 88 unresolved. The one new alias is `ftAction_SkipSmashSFX`; three existing names are corrected to DisableHitbox, SkipDisableHitbox and SkipRumble variants. Canonical names stay unchanged.

The [49-slot mapping](action_dispatch/table-slot-mapping.json) accounts for primary/alternate handlers and cursor lengths. [Object metadata](action_dispatch/object-metadata.json), [symbols](action_dispatch/object-symbols.txt) and [report evidence](action_dispatch/object-report.json) corroborate data-section attribution. Source hashes and the pinned report hash match the immutable inputs.

Owned renders have no parse errors. Supplemental shared-header renders have recorded parse errors; canonical source controls those conclusions. No PowerPC disassembly claim is made because the available objdump could not disassemble that target. Symbol, relocation and section-byte inspection succeeded.

Proposal SHA `39f7eeb57ca3c07905facea68058ba1265c7427fbd5c7e29bf705bfd7010b9e7`. Dry-run accepted 49 writes and rejected zero. All four reused librarians finished. No shared KB or source changes applied by this TU lead.

Independent-review repair: the 26-bit command operand assigned by ftAction_80072B14 is narrowed into a one-bit field. The two inherited no-transformation/boolean claims are unresolved. The 49-write proposal remains unchanged.

Additional width-review deferrals: 80072B3C data_flow and 800730B8 data_flow/inferred_type remain unresolved because payload and destination widths differ.

Further retained-claim deferrals: 80071B50 inferred_type and 80071FC8 data_flow/inferred_type require packed-width and random-selection domain qualifications.

## Reviewed final render

Root promoted 49 reviewed facts to the live KB. [Final-render receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftaction/final-render.json) records the exact reviewed rendered pages; [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftaction/staged-completion.json) and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/39f7eeb57ca3c07905facea68058ba1265c7427fbd5c7e29bf705bfd7010b9e7/2026-09-08T14-53-20.501Z-e2765be9-c3d0-4bf8-b19b-c8309c0493dc.receipt.json) establish application. Final-render SHA256: `a7953950af3b598ef78beb0c1efc018b9270620057f9bd30afa316e4166ca5c7`. Canonical source remains unchanged.
