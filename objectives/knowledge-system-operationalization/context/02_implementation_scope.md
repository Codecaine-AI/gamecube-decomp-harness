<implementation_scope>
    <owned_surfaces>
        - `src/cli/commands/kg.ts`: maintenance, curation, graph rebuild, and
          optional curator-agent review orchestration.
        - `src/knowledge/**`: graph builders, curation, source/tool registries,
          file cards, ranking, paths, and resource descriptors.
        - `src/board/**` and `src/state/**`: queue/rank filtering and
          read-only complete scheduling protection.
        - `src/cli/commands/worker.ts` and `src/agents/worker/**`: worker
          packet knowledge context, lookup guidance, acceptance/repair gates.
        - `knowledge/sources/**`: source-local data, commands, APIs, indexes,
          descriptors, and READMEs.
        - `knowledge/tools/**`: tool-local APIs, live runners, caches, indexes,
          descriptors, smoke tests, and operational contracts.
        - `docs/**`, `knowledge/README.md`, and source/tool READMEs:
          operational documentation.
    </owned_surfaces>

    <read_only_references>
        - `knowledge/sources/past_prs/data/prs/**`: generated PR postmortem
          corpus; regenerate through PR commands rather than hand-editing
          individual postmortems.
        - `knowledge/resource_graph/graph.sqlite`: generated graph DB; rebuild
          through `kg:rebuild`.
        - Upstream/canonical Melee decomp source files are outside this
          objective's edit surface. Use only explicit exported/generated inputs
          already represented in the orchestrator knowledge layout.
    </read_only_references>

    <generated_outputs>
        - `knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl`:
          deterministic and optional agent-reviewed curated records.
        - `knowledge/resource_graph/graph.sqlite`: rebuilt knowledge graph with
          source, tool-output, agent-shared-state, and curator enrichment data.
        - `knowledge/sources/*/indexes/*.jsonl`: source-local search indexes.
        - `knowledge/tools/*/indexes/*.jsonl`: tool-local lookup indexes.
        - `.pi-sessions/pr-review/` and `.pi-sessions/knowledge-curator/`:
          repo-local model session logs.
    </generated_outputs>

    <commands_and_entrypoints>
        - `bun run pr:sync:all` or an improved maintenance-equivalent command:
          fetch/sync upstream PRs and build postmortems.
        - `bun run kg:curate -- --pr-limit <n> --worker-limit <n>`: generate
          graph-owned curator enrichment.
        - `bun run kg:maintain`: maintenance loop covering PR indexing, tool
          index generation, curation, optional curator agent, and graph rebuild.
        - `bun run kg:rebuild -- --sources all`: rebuild the graph from
          registered orchestrator-owned inputs.
        - `bun run kg:smoke -- --strict`: graph/source/tool readiness check.
        - `python3 knowledge/sources/<source>/api/status.py --json` and
          `search.py`: source-local API smoke.
        - `python3 knowledge/tools/<tool>/api/status.py --json`: tool-local API
          smoke.
    </commands_and_entrypoints>

    <adjacent_surfaces_requiring_caution>
        - Pi provider/model configuration: preserve project-local `codex-lb`,
          `gpt-5.5`, `medium` defaults unless explicitly overridden.
        - Large generated PR corpus files: expect huge git status; do not clean
          or revert generated files unless asked.
        - GitHub API/PR fetching: handle rate limits resumably and document
          reset/wait state in `current_state.md` if blocked.
    </adjacent_surfaces_requiring_caution>

    <out_of_scope>
        - Building a new external service, MCP server, or hosted vector DB.
        - Solving Melee decomp target matches unrelated to the knowledge system.
        - Replacing the orchestrator architecture beyond what is required to
          make the knowledge lifecycle operational and truthful.
</implementation_scope>
