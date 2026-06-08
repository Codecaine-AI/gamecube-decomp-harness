import { resolve } from "node:path";
import { agentContextScripts, agentContextSummary, type AgentContextRole } from "../agents/context.js";
import {
  checkoutRoot,
  decompResourcesRoot,
  knowledgeSourcesRoot,
  knowledgeToolsRoot,
  packageRoot,
  pastPrsRoot,
  resourceGraphDbPath,
  resourceGraphRoot,
  sourceDataRoot,
} from "./paths.js";

export function resourceMap(repoRoot: string, role: AgentContextRole, capabilities: string[] = []): Record<string, unknown> {
  const checkout = checkoutRoot();
  const pastPrs = pastPrsRoot();
  const decompResources = decompResourcesRoot();
  const dataSheetData = sourceDataRoot("ssbm_data_sheet");
  const dataSheetCsvDir = resolve(dataSheetData, "csv");
  const powerpcData = sourceDataRoot("powerpc_docs");
  const externalMirrorsData = sourceDataRoot("external_mirrors");
  const scripts = agentContextScripts();
  return {
    roots: {
      board_repo_root: repoRoot,
      checkout_root: checkout,
      orchestrator_package: packageRoot(),
    },
    agent_context: agentContextSummary(role, capabilities),
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
        path: resolve(pastPrs, "prs/index.jsonl"),
        fields: ["pr", "title", "summary", "searchable_terms", "postmortem_json"],
        purpose: "distilled searchable PR lessons and pointers to per-PR postmortems",
      },
      known_fixes: resolve(pastPrs, "prs/known_fixes.md"),
      raw_analysis: [
        {
          path: resolve(pastPrs, "current/analysis/changed_files.jsonl"),
          purpose: "find PRs that touched a concrete source/config path",
        },
        {
          path: resolve(pastPrs, "current/analysis/text_corpus.jsonl"),
          purpose: "PR bodies, bot reports, comments, and reviews keyed by PR number",
        },
        {
          path: resolve(pastPrs, "current/analysis/human_pr_text.md"),
          purpose: "human-authored PR bodies and issue comments",
        },
        {
          path: resolve(pastPrs, "current/analysis/review_comments.md"),
          purpose: "review feedback, naming corrections, and review warnings",
        },
        {
          path: resolve(pastPrs, "current/analysis/decomp_tips_library.md"),
          purpose: "cross-PR matching and review lessons",
        },
      ],
      per_pr_detail_pattern: resolve(pastPrs, "prs/pr-<number>/postmortem.json"),
      search_examples: [
        `rg -n "<symbol>|<source_path>|<subsystem>|<mismatch_term>" "${resolve(pastPrs, "prs/index.jsonl")}" "${resolve(pastPrs, "prs/known_fixes.md")}"`,
        `jq 'select(.file=="<source_path>")' "${resolve(pastPrs, "current/analysis/changed_files.jsonl")}"`,
        `jq 'select(.pr == <number>)' "${resolve(pastPrs, "current/analysis/text_corpus.jsonl")}"`,
      ],
    },
    decomp_resources: {
      index: resolve(decompResources, "index.md"),
      notes: resolve(decompResources, "guides/resource_notes.md"),
      data_sheet_csv_dir: dataSheetCsvDir,
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
      graph_db: resourceGraphDbPath(),
      cli_policy: "CLI-first; no MCP server wrapper in v1.",
      source_ids: [
        "code_graph",
        "past_prs",
        "discord_knowledge",
        "ssbm_data_sheet",
        "powerpc_docs",
        "external_mirrors",
        "resource_guides",
        "reference_docs",
        "tool_outputs",
        "decomp_standards",
        "path_facts",
      ],
      tool_ids: ["ghidra", "opseq", "mismatch_db", "mwcc_debug"],
      commands: [
        {
          command: "bun run kg:sources",
          cwd: packageRoot(),
          purpose: "list registered knowledge source slices and external tool integrations",
        },
        {
          command: "bun run kg:rebuild -- --repo-root <repo_root>",
          cwd: packageRoot(),
          purpose: "rebuild the SQLite resource graph from code_graph, PRs, and graph-owned enrichments",
        },
        {
          command: "bun run kg:curate -- --repo-root <repo_root> --state-dir <state_dir>",
          cwd: packageRoot(),
          purpose: "reduce worker reports and PR postmortems into graph-owned curator enrichment records",
        },
        {
          command: "bun run kg:maintain -- --repo-root <repo_root> --state-dir <state_dir>",
          cwd: packageRoot(),
          purpose: "process pending PR postmortems, curate knowledge updates, and rebuild the graph",
        },
        {
          command: "bun run kg:file-card -- --repo-root <repo_root> --source <source_path>",
          cwd: packageRoot(),
          purpose: "summarize file graph context, editability, PR history, resource hits, and graph scheduling signals",
        },
        {
          command: "bun run kg:search -- --repo-root <repo_root> --source past_prs --query <term> --limit 10",
          cwd: packageRoot(),
          purpose: "search indexed graph chunks for a source slice such as past_prs",
        },
        {
          command: "python3 knowledge/sources/<source_id>/api/search.py --query <term> --limit 10 --json",
          cwd: packageRoot(),
          purpose: "source-local search for registered source slices using generated JSONL indexes",
        },
        {
          command: "python3 knowledge/sources/decomp_standards/api/search.py --query <term> --limit 10 --json",
          cwd: packageRoot(),
          purpose: "search global decomp standards that are injected into worker/writer and QA/PR-review contexts",
        },
        {
          command: "python3 knowledge/sources/path_facts/api/resolve_for_path.py --path <source_path> --limit 5 --json",
          cwd: packageRoot(),
          purpose: "resolve bounded path-scoped decomp hints for worker/writer packets",
        },
        {
          command: "python3 knowledge/sources/<source_id>/api/status.py --json",
          cwd: packageRoot(),
          purpose: "source-local readiness and index-count check for registered source slices",
        },
        {
          command: "bun run kg:rank-features -- --repo-root <repo_root> --limit 30",
          cwd: packageRoot(),
          purpose: "show graph-derived ranking features for current board candidates",
        },
      ],
    },
    helper_scripts: [
      {
        path: scripts.decomp_context_lookup.path,
        purpose: "first-pass target packet across local source, report metadata, PR corpus, and decomp resources",
      },
      {
        path: scripts.rank_decomp_candidates.path,
        purpose: "director target ranking from build/GALE01/report.json",
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
        purpose: "rank candidate functions and linked blocker units for director scheduling",
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
        command: `rg -n "<symbol>|<file>|<mismatch_term>" "${resolve(pastPrs, "prs/index.jsonl")}" "${resolve(pastPrs, "current/analysis")}"`,
        purpose: "search past PR summaries, comments, reviews, and diffs",
      },
      {
        command: "python3 knowledge/sources/discord_knowledge/api/search.py --query <compiler_or_review_term> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "search Discord-derived compiler and workflow knowledge with citations",
      },
      {
        command: "python3 knowledge/sources/ssbm_data_sheet/api/search.py --query <address_or_offset_or_id> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "search normalized data-sheet cells with row and CSV provenance",
      },
      {
        command: "python3 knowledge/sources/powerpc_docs/api/lookup_instruction.py --mnemonic <mnemonic> --limit 10 --json",
        cwd: packageRoot(),
        purpose: "look up PowerPC PDF page chunks for ABI and instruction questions",
      },
      {
        command: "python3 knowledge/tools/mismatch_db/api/search.py --query <mismatch_pattern> --limit 10 --json",
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
        command: "bun run pr:postmortems -- --dump-root knowledge/sources/past_prs/data/current --run-agent --pending-only --complete-only --jobs 16",
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
