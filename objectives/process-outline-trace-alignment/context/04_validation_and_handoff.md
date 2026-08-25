# Validation and Handoff

## Per-Process Walkthrough

For every inventory row:

1. Trigger the process through its real entry point.
2. Open the resulting trace in the harness UI or Observatory.
3. Walk the Process Outline from top to bottom against visible containers and rows.
4. Record `confirmed` or `mismatch` in `context/05_process_map.md`, with the trace identity, viewer, date, and mismatch detail.
5. Re-run the walkthrough after any fix to ordering, naming, hierarchy, or outline text.

## Validation Ladder

- Static docs validation: every changed `doc.json` parses and every Process Outline satisfies `{text, kind: step|note, steps}` with no children under notes.
- Focused server tests: container descriptions, parentage, spawn lineage, workflow event mapping, and missing-container repairs pass.
- Focused frontend tests: `buildTraceSpans` receives containers and produces the expected nested spans.
- Repository checks: relevant Bun test groups, TypeScript checks, docs validation, and `git diff --check` pass.
- Visual acceptance: every documented process has a real trace walkthrough with no unresolved mismatch.

## Verification Artifact

The Process Inventory table in `context/05_process_map.md` is the verification ledger. Each completed row must contain:

- process and outline location;
- runtime entry point and trigger;
- expected container lineage;
- real trace identity and viewer;
- status, either `confirmed` or `mismatch`;
- concise evidence or the exact mismatch and follow-up.

Do not mark a process verified from unit tests or source inspection alone.

## Handoff Contract

- Update `current_state.md` after each interview round and phase gate.
- Record naming decisions, completed inventory ranges, validation commands and results, active mismatches, behavior-bug follow-ups, and the exact next action.
- If a live walkthrough or long-running command remains active, record its command, process or session identity, start time, status or log path, trace identity, and safest resume action.
- Completion requires every in-scope row to be `confirmed`; unresolved behavior bugs may remain only when they do not make the documented trace false and are linked from the Bug Catalog.
