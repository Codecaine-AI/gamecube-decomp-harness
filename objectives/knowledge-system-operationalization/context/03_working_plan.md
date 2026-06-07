<working_plan>
    <overview>
        1. operational_audit - Re-audit every source, tool, graph artifact, and
           lifecycle entrypoint before changing behavior.
        2. source_lifecycle_completion - Make source refresh/index/status/search
           commands rooted in the orchestrator-owned layout, truthful, and
           documented.
        3. pr_and_curator_ingestion - Run or wire PR refresh/postmortems,
           deterministic curation, and optional curator-agent review in batches
           of 16.
        4. tool_operationalization - Make each knowledge tool genuinely
           runnable with smokeable APIs and runner artifacts.
        5. graph_and_worker_integration - Rebuild graph, verify worker packets,
           read-only scheduling, ranking, and maintenance wiring.
        6. validation_and_docs - Run full validation ladder and update docs plus
           current objective state.
    </overview>

    <operating_principles>
        - Treat "available" and "ready" as observable states backed by data,
          command output, and artifacts.
        - Prefer deterministic ingestion first; use model agents for PR-review
          and knowledge-curator review only where they add value, batching at
          concurrency 16.
        - Keep generated artifacts reproducible and resumable. Every long run
          should leave enough state for a future agent to continue.
        - Avoid parallel writes to the same artifact. Parallelize per-PR,
          per-record, per-tool, or per-source work only when merge/reduction is
          deterministic.
    </operating_principles>

    <phase id="1" name="operational_audit">
        <objective>
            - Establish the current readiness of each source, tool, graph
              artifact, maintenance command, agent integration, and worker
              packet before implementation.
        </objective>
        <inputs>
            - `knowledge/sources/registry.json`
            - `knowledge/tools/registry.json`
            - `knowledge/resource_graph/graph.sqlite`
            - `knowledge/resource_graph/enrichments/`
            - `.pi-sessions/`
            - `package.json`
            - `src/cli/commands/kg.ts`
            - `src/cli/commands/worker.ts`
            - `src/board/snapshot.ts`
        </inputs>
        <process>
            - Run `bun run kg:status` and record source/tool/graph counts.
            - Run source and tool status APIs and record which ones are real,
              fallback-only, or misleading.
            - Check whether `knowledge_curator_updates.jsonl` exists and
              whether `curator_enrichment` is in the graph.
            - Check PR dump/postmortem completeness and new-PR refresh wiring.
            - Check worker state DBs for worker reports and Pi session records.
        </process>
        <outputs>
            - `objectives/knowledge-system-operationalization/artifacts/audit_summary.json`:
              source/tool readiness, graph counts, missing artifacts, and
              immediate fixes.
        </outputs>
        <gate>
            - Audit separates static-readiness from dynamic-lifecycle readiness
              and lists every source/tool requiring implementation before this
              objective can be complete.
        </gate>
        <failure_handling>
            - If a command fails because an orchestrator-owned graph, source,
              index, or generated input is missing, document the missing path
              and fix the local contract before moving on.
        </failure_handling>
    </phase>

    <phase id="2" name="source_lifecycle_completion">
        <objective>
            - Make registered sources operational and truthful, with data,
              index, status, search, and refresh commands matching the real
              local layout.
        </objective>
        <inputs>
            - `knowledge/sources/*/source.json`
            - `knowledge/sources/*/api/*.py`
            - `knowledge/sources/*/commands/README.md`
            - `knowledge/sources/*/data/**`
            - Decomp Orchestrator knowledge source roots and generated indexes.
        </inputs>
        <process>
            - Verify source-local APIs resolve data from the Decomp
              Orchestrator tool layout. Do not "fix" them by pulling authority
              from an external checkout unless a descriptor explicitly declares
              an external generated input.
            - Convert "planned commands" into real commands or explicitly mark
              them deferred/fallback in descriptors and docs.
            - Verify data sheet CSV export, PowerPC PDF index, Discord docs,
              external mirrors, reference docs, resource guides, code graph,
              PR corpus, and tool-output source indexes.
            - Rebuild source indexes as needed.
        </process>
        <outputs>
            - Updated source descriptors, APIs, commands, READMEs, and index
              artifacts.
        </outputs>
        <gate>
            - Every registered source status API reports a truthful state and
              every search API returns useful JSON for representative queries.
        </gate>
        <failure_handling>
            - If a source cannot be refreshed locally, document the operator
              command, required dependency, and fallback state in `source.json`
              and the source README.
        </failure_handling>
    </phase>

    <phase id="3" name="pr_and_curator_ingestion">
        <objective>
            - Make PR refresh/postmortem and knowledge-curator ingestion part
              of the operational maintenance lifecycle.
        </objective>
        <inputs>
            - `knowledge/sources/past_prs/data/current/`
            - `knowledge/sources/past_prs/data/prs/index.jsonl`
            - `src/knowledge/curator.ts`
            - `src/agents/knowledge-curator/**`
            - `src/cli/commands/kg.ts`
        </inputs>
        <process>
            - Ensure new PR sync/refresh can run before pending postmortem
              indexing, or document the explicit two-command maintenance
              sequence if fully automatic sync is intentionally deferred.
            - Run pending PR-review work only for missing/incomplete records,
              with concurrency 16 for model-backed processing.
            - Run deterministic curation with high enough `--pr-limit` and
              `--worker-limit` to cover available evidence.
            - If curator-agent review is required, batch sampled or partitioned
              curator records at concurrency 16 and append proposals
              deterministically.
            - Rebuild graph with `curator_enrichment` included.
        </process>
        <outputs>
            - `knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl`
            - `.pi-sessions/knowledge-curator/*.jsonl` when agent review runs.
            - Updated `graph.sqlite` with curator facts/edges.
        </outputs>
        <gate>
            - Curator output exists, has accepted PR lessons and proposal
              records when evidence supports them, and appears in graph status
              after rebuild.
        </gate>
        <failure_handling>
            - If GitHub or model rate limits block progress, write the reset
              time and resumable command into `current_state.md` and continue
              deterministic source/tool work.
        </failure_handling>
    </phase>

    <phase id="4" name="tool_operationalization">
        <objective>
            - Make Ghidra, opseq, mismatch_db, mwcc_debug, sweeps, and
              tool_outputs fully operational through live local commands.
        </objective>
        <inputs>
            - `knowledge/tools/*/tool.json`
            - `knowledge/tools/*/api/*.py`
            - `knowledge/tools/*/runners/`
            - `knowledge/tools/*/cache/`
            - `knowledge/tools/build_tool_indexes.py`
            - `knowledge/tools/sweeps/*.py`
        </inputs>
        <process>
            - For each tool, identify the missing live command path, required
              local dependency, output/cache artifact, and representative
              smoke query.
            - Add or fix runner commands for every registered tool, including
              `ghidra`, `opseq`, `mismatch_db`, and `mwcc_debug`.
            - Ensure status output reports live operation mode, runner
              availability, latest runner smoke state, and any generated
              artifact/cache path.
            - Ensure `tool_outputs` source ingests all tool indexes and exposes
              search, similar-function, mismatch-pattern, and tool lookup APIs.
            - Smoke sweeps scripts enough to verify CLI help, importability, and
              any safe dry-run mode.
        </process>
        <outputs>
            - Updated `tool.json` descriptors, API/status outputs, runner
              README or scripts, cache/index artifacts, and docs.
        </outputs>
        <gate>
            - Every registered tool has a passing status smoke, representative
              lookup smoke, and live runner smoke. No registered tool remains
              fallback-only, index-only, scaffold-only, or dependency-blocked.
        </gate>
        <failure_handling>
            - If a tool requires missing external software, record the exact
              dependency and installation/setup command in `current_state.md`;
              do not mark the objective complete until that runner passes.
        </failure_handling>
    </phase>

    <phase id="5" name="graph_and_worker_integration">
        <objective>
            - Verify the graph, worker packets, director ranking, queue
              filtering, and post-return gates use the operational knowledge
              layer safely.
        </objective>
        <inputs>
            - `src/cli/commands/worker.ts`
            - `src/agents/worker/**`
            - `src/board/snapshot.ts`
            - `src/knowledge/graph/file-card.ts`
            - `src/knowledge/graph/rank.ts`
            - `src/state/targets.ts`
        </inputs>
        <process>
            - Verify worker knowledge packets include file card, source CLI
              commands, tool CLI commands, and graph DB path.
            - Verify acceptance gates and configured post-return checks reject
              unresolved regressions and provide repair attempts.
            - Verify board/rank/queue logic filters `read_only_complete`,
              `locked`, and `blocked` files before scheduling.
            - Verify `kg:file-card` on a 100% file returns read-only complete
              and on an unmatched file returns editable with relevant PR/tool
              hits.
        </process>
        <outputs>
            - Worker packet smoke artifacts and rank/queue filtering evidence
              in the objective artifacts directory.
        </outputs>
        <gate>
            - Workers can consume the knowledge layer and 100% files cannot be
              scheduled for editing through normal board/queue paths.
        </gate>
        <failure_handling>
            - If a check requires a live run, create a minimal dry-run or
              deterministic fixture rather than launching broad worker work
              without operator intent.
        </failure_handling>
    </phase>

    <phase id="6" name="validation_and_docs">
        <objective>
            - Prove operational readiness and update docs/current state with
              exact commands and evidence.
        </objective>
        <inputs>
            - Outputs from phases 1-5.
            - `docs/**`, `knowledge/README.md`, source/tool READMEs.
        </inputs>
        <process>
            - Run the validation ladder in `context/04_validation_and_handoff.md`.
            - Update docs to match real source/tool readiness, live runner
              commands, output artifacts, and maintenance steps.
            - Update `current_state.md` with final status, commands, artifacts,
              and remaining risks.
        </process>
        <outputs>
            - Passing command output summaries.
            - Updated docs and objective `current_state.md`.
        </outputs>
        <gate>
            - All completion criteria in `goal.md` and validation gates in
              `context/04_validation_and_handoff.md` are satisfied.
        </gate>
        <failure_handling>
            - If a validation gate fails, do not mark complete; record the
              failing command, hypothesis, and next concrete action.
        </failure_handling>
    </phase>
</working_plan>
