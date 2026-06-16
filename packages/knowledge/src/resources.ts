import { resolve } from "node:path";
import type { RunProjectMetadata } from "@decomp-orchestrator/core/types";
import {
  knowledgeSourcesRoot,
  knowledgeToolsRoot,
  packageRoot,
  pastPrsRoot,
  resourceGraphDbPath,
  resourceGraphRoot,
  sourceDataRoot,
} from "./paths.js";
import { readSourceRegistry, readToolRegistry } from "./graph/sources.js";

export interface ResourceMapScriptDefinition {
  path: string;
  purpose: string;
}

export interface ResourceMapOptions {
  agentContext: Record<string, unknown>;
  project?: RunProjectMetadata;
  scripts: Record<string, ResourceMapScriptDefinition>;
}

export function resourceMap(repoRoot: string, options: ResourceMapOptions): Record<string, unknown> {
  const project = options.project;
  const projectRepoRoot = project?.repoRoot ?? repoRoot;
  const graphDb = project?.graphDbPath ?? resourceGraphDbPath();
  const stateDir = project?.stateDir ?? "";
  const projectFlag = project?.projectId ? ` --project ${project.projectId}` : "";
  const pastPrs = pastPrsRoot();
  const dataSheetData = sourceDataRoot("ssbm_data_sheet");
  const dataSheetCsvDir = resolve(dataSheetData, "csv");
  const dataSheetGeneratedDir = resolve(dataSheetData, "generated");
  const powerpcData = sourceDataRoot("powerpc_docs");
  const externalMirrorsData = sourceDataRoot("external_mirrors");
  const scripts = options.scripts;
  const activeSources = readSourceRegistry();
  const activeSourceIds = activeSources.map((source) => source.id);
  const registeredTools = readToolRegistry();
  const registeredToolIds = registeredTools.map((tool) => tool.id);
  const sourceSections = {
    injectable: activeSources
      .filter((source) => source.section === "injectable")
      .map((source) => ({ id: source.id, title: source.title, access_modes: source.access_modes ?? [] })),
    rag_search: activeSources
      .filter((source) => source.section === "rag_search")
      .map((source) => ({ id: source.id, title: source.title, access_modes: source.access_modes ?? [] })),
    code_context: activeSources
      .filter((source) => source.section === "code_context")
      .map((source) => ({ id: source.id, title: source.title, access_modes: source.access_modes ?? [] })),
  };
  return {
    roots: {
      project_id: project?.projectId ?? null,
      project_kind: project?.projectKind ?? null,
      board_repo_root: projectRepoRoot,
      checkout_root: projectRepoRoot,
      state_dir: stateDir || null,
      orchestrator_package: packageRoot(),
    },
    agent_context: options.agentContext,
    objective: {
      primary_metric: "matched_code_percent",
      telemetry_metric: "fuzzy_match_percent",
      primary_work_product:
        "reviewable text-section/source code fixes, code-match blockers, and reusable source-shape facts",
      secondary_work_policy:
        "data, literal, symbol, and split cleanup is secondary; include it only when explicitly scoped, required for a code match, or blocking code-match validation",
      quality_bar: "reviewable Melee decomp source backed by local evidence and verifier output",
    },
    progress_inputs: [
      {
        path: resolve(repoRoot, "build/GALE01/report.json"),
        purpose: "current match metrics, function/unit status, and progress telemetry",
      },
      {
        path: resolve(repoRoot, "objdiff.json"),
        purpose: "unit metadata, source paths, compiler flags, and write-set derivation",
      },
    ],
    target_metadata: [
      {
        path: resolve(repoRoot, "config/GALE01/symbols.txt"),
        purpose: "symbol names and addresses",
      },
      {
        path: resolve(repoRoot, "config/GALE01/splits.txt"),
        purpose: "translation-unit and object ownership boundaries",
      },
      {
        path: resolve(repoRoot, "docs/glossary.md"),
        purpose: "canonical local shorthand and naming conventions",
      },
    ],
    local_context: [
      {
        path: resolve(repoRoot, "src"),
        purpose: "target source, sibling functions, headers, and local naming/style analogs",
      },
      {
        path: resolve(repoRoot, "include"),
        purpose: "project headers and struct/type definitions when present",
      },
    ],
    past_prs: {
      structured_index: {
        path: resolve(pastPrs, "library/index.jsonl"),
        fields: ["pr", "title", "summary", "searchable_terms", "postmortem_json"],
        purpose: "distilled searchable PR lessons and pointers to per-PR postmortems",
      },
      known_fixes: resolve(pastPrs, "library/known_fixes.md"),
      raw_analysis: [
        {
          path: resolve(pastPrs, "aggregate/changed_files.jsonl"),
          purpose: "find PRs that touched a concrete source/config path",
        },
        {
          path: resolve(pastPrs, "aggregate/text_corpus.jsonl"),
          purpose: "PR bodies, bot reports, comments, and reviews keyed by PR number",
        },
        {
          path: resolve(pastPrs, "aggregate/human_pr_text.md"),
          purpose: "human-authored PR bodies and issue comments",
        },
        {
          path: resolve(pastPrs, "aggregate/review_comments.md"),
          purpose: "review feedback, naming corrections, and review warnings",
        },
        {
          path: resolve(pastPrs, "aggregate/decomp_tips_library.md"),
          purpose: "cross-PR matching and review lessons",
        },
      ],
      per_pr_detail_pattern: resolve(pastPrs, "prs/pr-<number>/postmortem/postmortem.json"),
      search_examples: [
        `rg -n "<symbol>|<source_path>|<subsystem>|<mismatch_term>" "${resolve(pastPrs, "library/index.jsonl")}" "${resolve(pastPrs, "library/known_fixes.md")}"`,
        `jq 'select(.file=="<source_path>")' "${resolve(pastPrs, "aggregate/changed_files.jsonl")}"`,
        `jq 'select(.pr == <number>)' "${resolve(pastPrs, "aggregate/text_corpus.jsonl")}"`,
      ],
    },
    decomp_resources: {
      data_sheet_csv_dir: dataSheetCsvDir,
      data_sheet_generated_dir: dataSheetGeneratedDir,
      data_sheet_csvs: [
        resolve(dataSheetCsvDir, "cells.csv"),
        resolve(dataSheetCsvDir, "sheet_index.csv"),
        resolve(dataSheetCsvDir, "function_addresses.csv"),
        resolve(dataSheetCsvDir, "global_addresses.csv"),
        resolve(dataSheetCsvDir, "char_data_offsets.csv"),
        resolve(dataSheetCsvDir, "character_attributes.csv"),
        resolve(dataSheetCsvDir, "action_state_reference.csv"),
        resolve(dataSheetCsvDir, "hitbox_offsets.csv"),
        resolve(dataSheetCsvDir, "hurtbox_offsets.csv"),
        resolve(dataSheetCsvDir, "stage_data_offsets.csv"),
        resolve(dataSheetCsvDir, "entity_data_offsets.csv"),
        resolve(dataSheetCsvDir, "id_lists.csv"),
        resolve(dataSheetCsvDir, "subaction_events.csv"),
        resolve(dataSheetCsvDir, "bones.csv"),
        resolve(dataSheetCsvDir, "debug_menu_map.csv"),
      ],
      data_sheet_generated_csvs: [
        resolve(dataSheetGeneratedDir, "function_addresses.csv"),
        resolve(dataSheetGeneratedDir, "data_symbols.csv"),
        resolve(dataSheetGeneratedDir, "source_references.csv"),
        resolve(dataSheetGeneratedDir, "curator_updates.csv"),
        resolve(dataSheetGeneratedDir, "sheet_reconciliation.csv"),
      ],
      data_sheet_generated_index: resolve(dataSheetData, "..", "indexes", "codebase_facts.jsonl"),
      data_sheet_refresh_command: `python3 knowledge/sources/code_context/ssbm_data_sheet/commands/build_codebase_facts.py --repo-root ${projectRepoRoot} --json`,
      powerpc_index: resolve(powerpcData, "indexes/powerpc_pdf_pages.csv"),
      external_hint_indexes: [
        resolve(externalMirrorsData, "training_mode/indexes/gtme01_map_symbols.csv"),
        resolve(externalMirrorsData, "m_ex/indexes/header_symbols.csv"),
        resolve(externalMirrorsData, "tockdom/compiler.txt"),
      ],
      trust_rule: "local source, headers, symbols, splits, assembly, and objdiff outrank PR notes and mirrored external resources",
    },
    knowledge_graph: {
      sources_root: knowledgeSourcesRoot(),
      tools_root: knowledgeToolsRoot(),
      graph_root: resourceGraphRoot(),
      graph_db: graphDb,
      cli_policy: "CLI-first; no MCP server wrapper in v1.",
      source_ids: activeSourceIds,
      source_sections: sourceSections,
      graph_owned_enrichments: ["agent_shared_state", "curator_enrichment", "mismatch_patterns"],
      commands: [
        {
          command: "bun run kg:sources",
          cwd: packageRoot(),
          purpose: "list active knowledge source sections and external tool integrations",
        },
        {
          command: `bun run kg:rebuild --${projectFlag} --repo-root <repo_root> --graph-db <graph_db>`,
          cwd: packageRoot(),
          purpose: "rebuild the SQLite resource graph from code_graph, PRs, and graph-owned enrichments",
        },
        {
          command: `bun run kg:curate --${projectFlag} --repo-root <repo_root> --state-dir <state_dir>`,
          cwd: packageRoot(),
          purpose: "reduce worker reports and PR postmortems into graph-owned curator enrichment records",
        },
        {
          command: `bun run kg:maintain --${projectFlag} --repo-root <repo_root> --state-dir <state_dir> --graph-db <graph_db>`,
          cwd: packageRoot(),
          purpose: "process pending PR postmortems, curate knowledge updates, and rebuild the graph",
        },
        {
          command: `bun run kg:file-card --${projectFlag} --repo-root <repo_root> --source <source_path> --graph-db <graph_db>`,
          cwd: packageRoot(),
          purpose: "summarize file graph context, editability, PR history, resource hits, and graph scheduling signals",
        },
        {
          command: `bun run kg:search --${projectFlag} --repo-root <repo_root> --source past_prs --query <term> --limit 10 --graph-db <graph_db>`,
          cwd: packageRoot(),
          purpose: "search indexed graph chunks for a source slice such as past_prs",
        },
        {
          command: "python3 knowledge/sources/<section>/<source_id>/api/search.py --query <term> --limit 10 --json",
          cwd: packageRoot(),
          purpose: "source-local search for active source slices using generated JSONL indexes",
        },
        {
          command: "python3 knowledge/sources/rag_search/<source_id>/commands/vectorize.py --json",
          cwd: packageRoot(),
          purpose: "embed a RAG source's generated JSONL chunks into its source-local vector.sqlite index",
        },
        {
          command: "python3 knowledge/sources/rag_search/<source_id>/api/semantic_search.py --query <question> --limit 10 --json",
          cwd: packageRoot(),
          purpose: "hybrid semantic lookup over a vectorized RAG source with citation-preserving snippets",
        },
        {
          command: "python3 knowledge/sources/injectable/decomp_standards/api/search.py --query <term> --limit 10 --json",
          cwd: packageRoot(),
          purpose: "operator/curator focused lookup over global standards that are otherwise injected into worker context",
        },
        {
          command: "python3 knowledge/sources/injectable/path_facts/api/resolve_for_path.py --path <source_path> --limit 5 --json",
          cwd: packageRoot(),
          purpose: "resolve bounded path-scoped decomp hints selected for worker packets",
        },
        {
          command: "python3 knowledge/sources/<section>/<source_id>/api/status.py --json",
          cwd: packageRoot(),
          purpose: "source-local readiness and index-count check for active source slices",
        },
        {
          command: "bun run kg:rank-features -- --repo-root <repo_root> --limit 30",
          cwd: packageRoot(),
          purpose: "show graph-derived ranking features for current board candidates",
        },
      ],
    },
    tooling: {
      tools_root: knowledgeToolsRoot(),
      tool_ids: registeredToolIds,
      cache_policy:
        "Tool caches and generated indexes live under tools/<category>/<tool_id>/{cache,indexes}; each tool API decides whether cached evidence is fresh enough for the current query.",
      index_command: "python3 tools/build_tool_indexes.py --repo-root <repo_root>",
      runner_policy: "Runners are operator/maintenance surfaces; workers normally call first-class Pi tools or tools/<category>/<tool_id>/api/*.py.",
    },
    helper_scripts: [
      {
        path: scripts.decomp_context_lookup.path,
        purpose: "first-pass target packet across local source, report metadata, PR corpus, data sheets, PowerPC docs, and external mirrors",
      },
      {
        path: scripts.rank_decomp_candidates.path,
        purpose: "scheduler target ranking from build/GALE01/report.json",
      },
      {
        path: scripts.fetch_recent_pr_dump.path,
        purpose: "refresh the orchestrator-owned raw PR dump and searchable PR library",
      },
      {
        path: scripts.build_pr_postmortems.path,
        purpose: "build or rerun PR postmortem knowledge records",
      },
      {
        path: scripts.sync_repo_and_pr_library.path,
        purpose: "sync the repo branch and PR knowledge library in one operator workflow",
      },
    ],
    optional_experimental_tools: [
      {
        path: scripts.scaffold_decomp_run.path,
        purpose: "create a reproducible decomp-runs/<slug> experimental search bundle",
      },
      {
        path: scripts.analyze_sweep_results.path,
        purpose: "analyze experimental search results and write next-search plans",
      },
      {
        path: scripts.render_progress_charts.path,
        purpose: "render experimental search progress charts",
      },
      {
        path: scripts.summarize_objdiff_json.path,
        purpose: "summarize objdiff JSON for experimental search result rows",
      },
    ],
    commands: [
      {
        command: "rg <pattern> <paths>",
        purpose: "fast repo search",
      },
      {
        command: `python3 "${scripts.rank_decomp_candidates.path}" --limit 30`,
        cwd: repoRoot,
        purpose: "rank candidate functions and linked blocker units for deterministic scheduling",
      },
      {
        command: `python3 "${scripts.decomp_context_lookup.path}" --target <source_path> --symbol <symbol>`,
        purpose: "assemble first-pass local, PR, and resource evidence",
      },
      {
        command: `rg -i "<offset>|<address>|<field>|<action_state>|<hitbox>|<sfx>" "${dataSheetCsvDir}"`,
        purpose: "search data-sheet offsets, IDs, states, attributes, and lookup terms",
      },
      {
        command: `rg -n "<symbol>|<file>|<mismatch_term>" "${resolve(pastPrs, "library/index.jsonl")}" "${resolve(pastPrs, "aggregate")}"`,
        purpose: "search past PR summaries, comments, reviews, and diffs",
      },
      {
        command: "python3 knowledge/sources/rag_search/discord_knowledge/api/search.py --query <compiler_or_review_term> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "search Discord-derived compiler and workflow knowledge with citations",
      },
      {
        command: "python3 knowledge/sources/rag_search/discord_knowledge/api/semantic_search.py --query <question> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "semantic RAG lookup over vectorized Discord-derived compiler and workflow knowledge",
      },
      {
        command: "python3 knowledge/sources/code_context/ssbm_data_sheet/api/search.py --query <address_or_offset_or_id> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "search normalized data-sheet cells with row and CSV provenance",
      },
      {
        command: "python3 knowledge/sources/rag_search/powerpc_docs/api/lookup_instruction.py --mnemonic <mnemonic> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "look up PowerPC PDF page chunks for ABI and instruction questions",
      },
      {
        command: "python3 knowledge/sources/rag_search/powerpc_docs/api/semantic_search.py --query <question> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "semantic RAG lookup over vectorized PowerPC ABI, compiler-guide, and ISA page chunks",
      },
      {
        command: "python3 tools/research/mismatch_db/api/search.py --query <mismatch_pattern> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "search local mismatch-pattern/tool evidence",
      },
      {
        command: "bun run pr:refresh:dry",
        cwd: packageRoot(),
        purpose: "preview the PR knowledge refresh scope without writing",
      },
      {
        command: "bun run pr:refresh -- --postmortem-mode scaffold",
        cwd: packageRoot(),
        purpose: "refresh missing recent PRs and rebuild deterministic PR knowledge records",
      },
      {
        command: "bun run pr:postmortems -- --dump-root knowledge/sources/code_context/past_prs/data --run-agent --pending-only --complete-only --jobs 16",
        cwd: packageRoot(),
        purpose: "run Pi-reviewed PR postmortems for missing, draft, or failed records in the orchestrator-owned PR dump",
      },
      {
        command: "python configure.py --require-protos",
        purpose: "regenerate build metadata with prototype checks when needed",
      },
      {
        command: "ninja baseline",
        purpose: "operator-only upstream progress baseline capture before a branch regression check",
      },
      {
        command: "bun run regression-check -- --repo-root <repo_root>",
        cwd: packageRoot(),
        purpose: "operator-only final global regression gate after workers are idle; also writes pr_report.md for the Expected / local run PR description",
      },
      {
        command: "ninja changes_all",
        purpose: "operator-only branch regression/progression report against the saved upstream baseline; use regression-check for the enforced gate and PR Markdown report",
      },
      {
        command: "ninja build/GALE01/<object>.o",
        purpose: "narrow object rebuild for the leased source file",
      },
      {
        command: "build/tools/objdiff-cli diff -p . -u <unit> <symbol>",
        purpose: "narrow symbol/unit diff validation",
      },
      {
        command: "go run . dups",
        cwd: resolve(repoRoot, "tools/table-typer"),
        purpose: "duplicate assembly-shape evidence for adaptation targets",
      },
    ],
    optional_experimental_commands: [
      {
        command: `python3 "${scripts.scaffold_decomp_run.path}" --name <run-slug> --source <source_path> --symbol <symbol>`,
        cwd: repoRoot,
        purpose: "scaffold a decomp-runs bundle when experimental_search is explicitly enabled",
      },
      {
        command: `python3 "${scripts.analyze_sweep_results.path}" <run-dir>`,
        cwd: repoRoot,
        purpose: "analyze experimental search results after a run has result artifacts",
      },
      {
        command: `python3 "${scripts.render_progress_charts.path}" <run-dir>`,
        cwd: repoRoot,
        purpose: "render progress charts for an experimental search run",
      },
    ],
  };
}
