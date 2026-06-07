<goal>
    - Fully operationalize the Decomp Orchestrator knowledge system end to end:
      source refresh/index paths, PR refresh/postmortem ingestion, deterministic
      and agent-reviewed curation, graph ingestion, worker/orchestrator lookup
      integration, and every registered knowledge tool slice.
    - "Fully operational" means every registered source and tool has a live,
      runnable local command path with smoke coverage. `fallback_only_v1`,
      `index_backed_v1`, scaffold-only, dependency-blocked, or lookup-only
      status is not sufficient for completion.
    - Use concurrency 16 for safe model-backed PR-review, knowledge-curator,
      ingestion, or batch processing work.
</goal>

<context_refresh>
    - Reread `objectives/knowledge-system-operationalization/goal.md`,
      `current_state.md`, and `context/00_problem.md` through
      `context/04_validation_and_handoff.md`.
    - Treat this bundle as authority. Previous smoke success or honest fallback
      status does not mean operational readiness; live-run the source lifecycle
      and tool runner gates in this bundle.
</context_refresh>

<working_strategy>
    - Start from the existing populated knowledge base, then close every
      remaining live-runner gap instead of accepting fallback/index lookup.
    - Make the maintenance path real: new PR sync, pending postmortems,
      deterministic curator output, curator-agent review, graph rebuild, and
      strict smoke.
    - Keep APIs rooted in the Decomp Orchestrator layout and make source/tool
      contracts observable through successful commands, generated artifacts,
      and status output that reports live runner health.
    - Preserve worker safety: 100% complete files are read-only references and
      must not be schedulable/editable.
</working_strategy>

<success_metrics>
    - `kg:status` reports records for every registered source plus curator
      enrichment when records exist.
    - Full curation writes graph-owned enrichment records and those records are
      ingested into `graph.sqlite`.
    - Source APIs pass JSON smoke checks and refresh/index commands are
      reproducible from the orchestrator layout.
    - Every registered tool passes status, lookup, and live runner smoke. Status
      must report a live operational mode with runner availability, not
      fallback/index/scaffold readiness.
    - Worker packets include useful file cards and CLI lookup routes; queue/rank
      filtering excludes read-only complete files.
</success_metrics>

<non_goals>
    - Do not mutate upstream/canonical Melee decomp source files; this
      objective owns the separate Decomp Orchestrator tool and knowledge
      artifacts.
    - Do not hide scaffold-only, lookup-only, dependency-blocked, or
      fallback-only integrations behind a misleading "ready" status.
    - Do not build a full MCP server; keep knowledge access CLI-first.
</non_goals>

<completion_criteria>
    - Full PR refresh/postmortem, curation, graph rebuild, strict smoke,
      source API smoke, live source refresh/index smoke, live tool API/runner
      smoke, worker packet checks, rank/queue filtering checks, and
      TypeScript/Python validation all pass.
    - Required subagents, including PR-review and knowledge-curator ingestion,
      have run in safe batches of 16 where needed.
    - All registered tools, including `ghidra`, `opseq`, `mismatch_db`, and
      `mwcc_debug`, have live runner commands with artifacts/caches as
      applicable and docs that describe real operational behavior.
    - No registered source/tool remains fallback-only, index-only,
      scaffold-only, dependency-blocked, or lookup-only at completion.
    - Update `objectives/knowledge-system-operationalization/current_state.md`
      with final commands, artifacts, remaining risks, and completion evidence.
</completion_criteria>
