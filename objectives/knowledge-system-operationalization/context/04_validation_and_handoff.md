<validation_and_handoff>
    <validation_ladder>
        - `bun run kg:status`: graph DB exists and reports expected source,
          tool, version, entity, fact, edge, and chunk counts.
        - `bun run kg:curate -- --pr-limit 5000 --worker-limit 5000`: writes
          curator enrichment records to the real graph-owned enrichment path.
        - `bun run kg:rebuild -- --sources all`: rebuilds graph with all
          registered orchestrator-owned sources and enrichments.
        - `bun run kg:smoke -- --strict`: every registered source/tool passes
          the strict readiness smoke.
        - Source API smoke: for each registered source, run status and one
          representative search/lookup command with `--json`.
        - Tool API and runner smoke: for each registered tool, run status, one
          representative lookup, and one live runner command that proves the
          tool is operational in the local environment.
        - Worker packet/file-card smoke: run `kg:file-card` on a known 100%
          file and a known editable file; verify editability and resource hits.
        - Rank/queue filtering smoke: verify board snapshot excludes
          `read_only_complete`, `locked`, and `blocked` candidates.
        - Validation compilation: `bun run check` and Python `py_compile` for
          source/tool APIs and changed scripts.
    </validation_ladder>

    <artifact_contract>
        - `objectives/knowledge-system-operationalization/artifacts/audit_summary.json`:
          per-source and per-tool readiness, gaps, and chosen disposition.
        - `knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl`:
          one JSONL curated record per accepted/proposal knowledge item.
        - `objectives/knowledge-system-operationalization/artifacts/source_api_smoke.json`:
          command, exit code, and key result count for each source API.
        - `objectives/knowledge-system-operationalization/artifacts/tool_api_smoke.json`:
          command, exit code, live operation mode, runner availability, runner
          command, generated artifact/cache path, and lookup result count for
          each tool.
        - `objectives/knowledge-system-operationalization/artifacts/worker_packet_smoke.json`:
          file-card and packet checks for read-only and editable examples.
        - `objectives/knowledge-system-operationalization/artifacts/validation_summary.json`:
          final command list, pass/fail status, generated artifact paths, and
          remaining known limitations.
    </artifact_contract>

    <acceptance_gates>
        - No active source or tool reports "ready" solely because a scaffold
          file or lookup index exists.
        - Curator enrichment is generated and graph-ingested when evidence
          records exist.
        - PR lifecycle is resumable and covers new PR refresh/sync plus pending
          postmortem processing, or docs state the exact required operator
          command sequence.
        - Worker evidence can flow from report persistence to curation and graph
          ingestion once worker reports exist.
        - Every registered tool slice is runnable through a local command path.
          `fallback_only_v1`, `index_backed_v1`, dependency-blocked, or
          lookup-only status is an incomplete state, not an acceptance path.
        - 100% complete files are read-only references and unschedulable through
          normal board/queue paths.
    </acceptance_gates>

    <handoff_update>
        - Update `objectives/knowledge-system-operationalization/current_state.md`
          before any pause, compaction, or final response.
        - Include exact next command if blocked by rate limits, missing
          dependency, model failures, or external setup.
        - Final response should summarize live operational tool commands,
          validation commands run, generated artifacts, and residual risk.
    </handoff_update>
</validation_and_handoff>
