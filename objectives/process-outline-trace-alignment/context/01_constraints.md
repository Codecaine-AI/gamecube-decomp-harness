# Constraints

## Fidelity Standard

- Make outlines detailed enough to mirror the visible trace and add a few words of explanation per step.
- Exact sentence matching is unnecessary. Proper trace names are exact: if a node is named Epoch, Worker, PR review, or Sync, the outline uses that name and never a synonym.
- Preserve trace order, nesting, branch points, and meaningful terminal paths. Include shutdown and drain behavior where it is part of the real process.
- Treat the harness as one global flow. Workflows, lifecycles, lanes, and other named processes are subprocesses of that flow.

## Naming and Bug Rules

- Choose one winning term for each concept during Round 2, then apply it to docs, emitted labels, container descriptions, and operator-facing UI text in scope.
- Do not leave compatibility synonyms in Process Outlines. If a code identifier cannot change safely, keep the internal identifier and normalize its displayed name.
- Triage every discovered defect by severity in `context/05_process_map.md`.
- Fix trace-emission, hierarchy, parentage, and labeling bugs inline. Catalog behavior bugs for separate objective threads instead of expanding this objective.

## Document Graph Rules

- Edit `docs/**/doc.json` block graphs, not Markdown mirrors.
- A Process Outline block has `{"type":"process-outline","props":{"steps":[...]}}`.
- Each step has `text`, optional `kind`, and optional nested `steps`.
- `kind` is `step` or `note`. A note cannot have child steps.
- Give every root step a non-empty name. Do not use Process Outline blocks for sequence diagrams, prose dumps, or migration tables.

## Validity Gates

- A docs edit is invalid if the JSON does not parse, the block graph violates the Process Outline schema, or a note has children.
- A trace fix is incomplete if the process remains flat, a child is attached to the wrong parent, or a documented named step has no observable trace counterpart.
- A naming change is incomplete while the old competing operator-facing term remains on an in-scope path without an explicit compatibility reason in the naming table.
