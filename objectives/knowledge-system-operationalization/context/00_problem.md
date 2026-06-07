<problem>
    <objective_question>
        - What remains to make the Decomp Orchestrator knowledge system fully
          operational rather than smoke-ready, and what work must be completed
          so workers, the director, PR ingestion, curation, graph ranking, and
          knowledge tools all use the same durable data layer?
    </objective_question>

    <current_baseline>
        - The static graph exists at `knowledge/resource_graph/graph.sqlite`
          and currently has populated search chunks for registered sources.
        - The past-PR corpus has `2501 / 2501` postmortems completed and
          source-local PR indexes generated.
        - Source-local and tool-local CLI APIs exist and pass basic lookup
          smoke checks.
        - The dynamic lifecycle is incomplete: curator enrichment was not
          written to the graph-owned enrichment path, the knowledge-curator
          agent has not run, and `worker_graph_updates` /
          `merged_pr_updates` were empty during the audit.
    </current_baseline>

    <why_current_state_is_insufficient>
        - `kg:smoke -- --strict` proves every registered source has at least
          one graph chunk, but it does not prove that PR/worker evidence is
          being reduced into curator records and re-ingested.
        - Tool APIs can be "ready" while only serving fallback indexes derived
          from generated reports or reference docs.
        - Maintenance can index pending postmortems inside the local PR dump,
          but it does not yet prove that newly merged upstream PRs are fetched,
          queued, curated, and rebuilt as one lifecycle.
        - Source-local status for `code_graph` is expected to resolve from the
          Decomp Orchestrator tool root. Do not treat this separate-tool
          boundary as drift.
    </why_current_state_is_insufficient>

    <failure_modes>
        - `static_only_success`: graph/search works, but curator enrichment and
          worker/PR update tables stay empty.
        - `misleading_tool_ready`: a tool reports ready because an index exists,
          while runners/caches are absent or fallback-only.
        - `stale_pr_lifecycle`: existing PR postmortems are complete, but new
          PR fetch/sync is not wired into maintenance.
        - `unsafe_complete_file_editing`: a 100% matched file is attractive to
          ranking or scheduling despite being read-only complete.
        - `root_boundary_confusion`: APIs, docs, or descriptors imply an
          external checkout is the authoritative root for this separate tool
          when registered knowledge data lives under the orchestrator.
    </failure_modes>

    <prior_evidence>
        - `knowledge/resource_graph/graph.sqlite`: static graph exists with
          source chunks and legacy shared-state enrichment.
        - `knowledge/sources/past_prs/data/prs/run_summary.json`: latest PR
          run used `jobs: 32`, `gpt-5.5`, `medium`, and completed active
          postmortem records.
        - Temporary curation audit generated `9015` records from PR evidence:
          `4918` accepted PR lessons and `4097` source update proposals.
        - `init-run/orchestrator.sqlite` was empty during audit, so no worker
          report evidence stream had been exercised locally.
    </prior_evidence>

    <expected_value>
        - By the end, the knowledge layer should support real operation:
          workers receive useful packets, can call source/tool CLIs, report
          facts, have accepted work force-validated, and have their evidence
          curated into the graph; PR refreshes and merged work should follow
          the same ingestion path.
    </expected_value>
</problem>
