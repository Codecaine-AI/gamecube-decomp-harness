<constraints>
    <hard_rules>
        - Keep knowledge access CLI-first; do not wrap the system in a full MCP
          server for this objective.
        - Use concurrency 16 for agent-backed or batch ingestion work where
          jobs are independent and output writes are deterministic.
        - Do not mark the objective complete while any registered active source
          or tool is scaffold-only, fallback-only, index-only,
          dependency-blocked, or lookup-only.
        - Preserve existing user or generated work in the repo; do not revert
          unrelated dirty files.
        - Files marked `read_only_complete` must remain unavailable for worker
          editing and normal queue scheduling.
    </hard_rules>

    <forbidden_shortcuts>
        - `smoke_only_completion`: invalid because strict smoke does not verify
          curation, maintenance refresh, tool runners, or worker update flow.
        - `fake_tool_operational`: invalid because a generated index is not the
          same as a runnable Ghidra/MWCC/opseq/sweep integration.
        - `manual_status_claim`: invalid unless supported by command output,
          artifact files, descriptor changes, and passing smoke results.
        - `broad_source_mutation`: invalid unless the edit is needed for the
          orchestrator knowledge system, not for decomp target matching.
    </forbidden_shortcuts>

    <data_and_feature_boundaries>
        - PR postmortems are historical evidence and should flow through
          deterministic curation before becoming graph-owned lessons.
        - Worker reports are local evidence and should be accepted only through
          structured acceptance gates and post-return validation.
        - Data sheet, Discord, PowerPC docs, external mirrors, reference docs,
          and tool outputs should stay co-located under `knowledge/sources/*`
          or `knowledge/tools/*`.
        - Source update proposals are proposal-only unless a human/operator or
          explicit source owner process applies them.
    </data_and_feature_boundaries>

    <risk_budget>
        - `model_batch_failures`: tolerate transient agent failures only when
          resumable artifacts identify failed records and the next batch can
          retry; do not silently scaffold fake completed records.
        - `tool_runner_absence`: an incomplete state. Record the missing
          dependency/command in `current_state.md`, then keep working until the
          live runner smoke passes.
        - `graph_staleness`: any source refresh, curation run, or tool index
          regeneration must be followed by graph rebuild and strict smoke.
    </risk_budget>

    <promotion_or_completion_gates>
        - `curator_ingested`: `knowledge_curator_updates.jsonl` exists when
          records are available, and `graph.sqlite` contains
          `curator_enrichment` records after rebuild.
        - `worker_safety`: worker acceptance gates and post-return checks reject
          unresolved regressions and record repair attempts.
        - `tool_truthfulness`: every tool reports live operation only when a
          working runner/API smoke and generated artifact/cache evidence exist.
        - `new_pr_lifecycle`: maintenance or a documented command sequence can
          fetch/sync new PRs, index pending postmortems, curate, and rebuild.
</constraints>
