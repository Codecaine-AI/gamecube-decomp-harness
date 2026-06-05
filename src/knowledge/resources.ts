import { resolve } from "node:path";
import { checkoutRoot, decompResourcesRoot, knowledgeManifestPath, packageRoot, pastPrsRoot } from "./paths.js";
import { knowledgeScripts, knowledgeSummary, type KnowledgeRole } from "./manifest.js";

export function resourceMap(repoRoot: string, role: KnowledgeRole, capabilities: string[] = []): Record<string, unknown> {
  const checkout = checkoutRoot();
  const pastPrs = pastPrsRoot();
  const decompResources = decompResourcesRoot();
  const dataSheetCsvDir = resolve(decompResources, "data_sheets/ssbm_data_sheet_1_02/csv");
  const scripts = knowledgeScripts();
  return {
    roots: {
      board_repo_root: repoRoot,
      checkout_root: checkout,
      orchestrator_package: packageRoot(),
    },
    knowledge: knowledgeSummary(role, capabilities),
    objective: {
      primary_metric: "matched_code_percent",
      telemetry_metric: "fuzzy_match_percent",
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
          path: resolve(pastPrs, "current/analysis/diff_lines.jsonl"),
          purpose: "line-level historical diffs for relevant PRs",
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
        `jq 'select(.pr == <number>)' "${resolve(pastPrs, "current/analysis/diff_lines.jsonl")}"`,
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
      powerpc_index: resolve(decompResources, "documents/powerpc/indexes/powerpc_pdf_pages.csv"),
      external_hint_indexes: [
        resolve(decompResources, "external/training_mode/indexes/gtme01_map_symbols.csv"),
        resolve(decompResources, "external/m_ex/indexes/header_symbols.csv"),
        resolve(decompResources, "external/tockdom/compiler.txt"),
      ],
      trust_rule: "local source, headers, symbols, splits, assembly, and objdiff outrank PR notes and mirrored external resources",
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
        command: "bun run pr:postmortems -- --dump-root knowledge/past_prs/current --run-agent --rerun-existing --jobs 16",
        cwd: packageRoot(),
        purpose: "rerun Pi-reviewed PR postmortems for the orchestrator-owned PR dump",
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
        command: "python3 tools/changes_fmt.py --pr-report --report-title 'Report for GALE01 (<base> - <head>)' build/GALE01/report_changes.json -o <artifact_dir>/pr_report.md",
        purpose: "manual fallback for regenerating the PR-style Markdown report from report_changes.json",
      },
      {
        command: "ninja changes_all",
        purpose: "operator-only branch regression/progression report against the saved upstream baseline; fails on regressions",
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
