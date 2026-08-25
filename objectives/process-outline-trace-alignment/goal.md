<goal>
    - Align every harness documentation Process Outline with the runtime trace an operator sees in the harness UI or Observatory.
    - Rebuild inaccurate outlines, add hierarchical trace containers and lineage for documented processes, and use one naming convention across docs, server traces, and UI labels.
</goal>

<context_refresh>
    - Reread `objectives/process-outline-trace-alignment/goal.md`, `current_state.md`, and every file under `context/` at objective start and after resume or compaction.
    - Treat `context/05_process_map.md` as the living interview record, process inventory, naming ledger, bug catalog, and verification table.
</context_refresh>

<working_strategy>
    - Finish the operator's Round 2 naming and structure decisions before broad edits.
    - Inventory all 49 Process Outline blocks and their runtime entry points, events, containers, and lineage.
    - Fix trace emission and labeling before rewriting outlines so the emitted trace is the executable reference.
    - Apply the fidelity standard to the global flow and each subprocess. Preserve proper trace names such as Epoch, Worker, PR review, and Sync.
    - Triage discovered bugs by severity. Fix trace-emission and labeling bugs inline; record behavior bugs for separate work.
    - Validate each process by walking a real trace against its outline and recording the result in `context/05_process_map.md`.
</working_strategy>

<success_metrics>
    - All 49 Process Outline blocks are inventoried and classified as a process outline, misuse to convert, or migration defect.
    - Every documented process emits real hierarchical containers and lineage, and both trace viewers receive the container data they need.
    - Outlines mirror trace order and granularity with a short explanation per step, while proper names match exactly.
    - Every process has a real-trace verification row marked confirmed or an explicit mismatch that blocks completion.
    - Relevant Bun tests, frontend checks, doc graph validation, and trace walkthroughs pass.
</success_metrics>

<non_goals>
    - Do not edit Process Outlines in Core or other repositories in this objective; the doctrine update is the only cross-repo exception.
    - Do not fix behavior bugs beyond severity triage and cataloging.
    - Do not build an embedded-trace documentation feature.
</non_goals>

<completion_criteria>
    - Round 2 decisions are recorded and applied consistently.
    - All harness and global-process outlines use the agreed structure, vocabulary, detail, and valid block schema.
    - Trace emission, labels, parentage, and frontend container wiring expose the documented hierarchy.
    - The verification table contains no unresolved mismatch for an in-scope process.
    - Harness doctrine and the Core docs-system Process Outline vocabulary page describe the final convention.
    - `current_state.md` records final validation, remaining behavior-bug threads, and exact handoff paths.
</completion_criteria>
