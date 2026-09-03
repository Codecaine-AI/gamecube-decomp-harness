import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { buildAgentSharedStateGraphRecords } from "./agent-shared-state.js";
import { buildCallGraphEdgeRecords } from "./call-graph-edges.js";
import { buildCodeGraphRecords } from "./code-graph.js";
import { buildDecompStandardsGraphRecords } from "./decomp-standards.js";
import { buildDocumentSourceGraphRecords } from "./document-sources.js";
import { buildGhidraXrefGraphRecords } from "./ghidra-xrefs.js";
import { insertGraphRecords, openKnowledgeGraph, resetKnowledgeGraph, upsertSourceDescriptor, upsertToolDescriptor, graphStats, writeReportProvenance } from "../db.js";
import { buildKnowledgeCuratorGraphRecords } from "./knowledge-curator.js";
import { buildMismatchPatternGraphRecords } from "./mismatch-patterns.js";
import { buildOpseqSimilarityGraphRecords } from "./opseq-similarity.js";
import { buildPastPrsGraphRecords } from "./past-prs.js";
import { buildSiblingGraphRecords } from "./siblings.js";
import { readSourceRegistry, readToolRegistry } from "../registry/sources.js";

const STATIC_GRAPH_SOURCES = [
  "code_graph",
  "past_prs",
  "decomp_standards",
  "agent_shared_state",
  "curator_enrichment",
  "mismatch_patterns",
  "opseq_similarity",
  "call_graph",
  "ghidra_xrefs",
  "siblings",
];

export interface RebuildKnowledgeGraphOptions {
  repoRoot: string;
  dbPath?: string;
  sources?: string[];
  agentStateEnrichmentPath?: string;
  knowledgeCuratorEnrichmentPath?: string;
  reportPath?: string;
}

export function rebuildKnowledgeGraph(options: RebuildKnowledgeGraphOptions): Record<string, unknown> {
  const selected = new Set(options.sources && options.sources.length > 0 ? options.sources : defaultGraphSources());
  const store = openKnowledgeGraph(options.dbPath);
  const indexedSources: string[] = [];
  const skippedSources: string[] = [];
  try {
    resetKnowledgeGraph(store);
    const reportPath = resolve(options.repoRoot, options.reportPath ?? "build/GALE01/report.json");
    const provenance = reportProvenance(options.repoRoot, reportPath);
    if (provenance) writeReportProvenance(store, provenance);
    const sourceDescriptors = readSourceRegistry();
    for (const source of sourceDescriptors) upsertSourceDescriptor(store, source);
    for (const tool of readToolRegistry()) upsertToolDescriptor(store, tool);

    if (selected.has("code_graph")) {
      insertGraphRecords(store, buildCodeGraphRecords(options.repoRoot));
      indexedSources.push("code_graph");
    }
    if (selected.has("past_prs")) {
      insertGraphRecords(store, buildPastPrsGraphRecords());
      indexedSources.push("past_prs");
    }
    if (selected.has("decomp_standards")) {
      const records = buildDecompStandardsGraphRecords();
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("decomp_standards");
      } else {
        skippedSources.push("decomp_standards");
      }
    }
    if (selected.has("agent_shared_state")) {
      const records = buildAgentSharedStateGraphRecords(options.repoRoot, options.agentStateEnrichmentPath);
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("agent_shared_state");
      } else {
        skippedSources.push("agent_shared_state");
      }
    }
    if (selected.has("curator_enrichment")) {
      const records = buildKnowledgeCuratorGraphRecords(options.knowledgeCuratorEnrichmentPath);
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("curator_enrichment");
      } else {
        skippedSources.push("curator_enrichment");
      }
    }
    if (selected.has("mismatch_patterns")) {
      const records = buildMismatchPatternGraphRecords(options.repoRoot, {
        agentStateEnrichmentPath: options.agentStateEnrichmentPath,
        knowledgeCuratorEnrichmentPath: options.knowledgeCuratorEnrichmentPath,
      });
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("mismatch_patterns");
      } else {
        skippedSources.push("mismatch_patterns");
      }
    }
    if (selected.has("opseq_similarity")) {
      const records = buildOpseqSimilarityGraphRecords(options.repoRoot);
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("opseq_similarity");
      } else {
        skippedSources.push("opseq_similarity");
      }
    }
    if (selected.has("call_graph")) {
      const records = buildCallGraphEdgeRecords(options.repoRoot);
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("call_graph");
      } else {
        skippedSources.push("call_graph");
      }
    }
    if (selected.has("ghidra_xrefs")) {
      const records = buildGhidraXrefGraphRecords(options.repoRoot);
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("ghidra_xrefs");
      } else {
        skippedSources.push("ghidra_xrefs");
      }
    }
    if (selected.has("siblings")) {
      const records = buildSiblingGraphRecords(options.repoRoot);
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push("siblings");
      } else {
        skippedSources.push("siblings");
      }
    }
    for (const source of sourceDescriptors) {
      if (
        source.kind !== "document"
        || source.active === false
        || STATIC_GRAPH_SOURCES.includes(source.id)
        || !selected.has(source.id)
      ) continue;
      const records = buildDocumentSourceGraphRecords(source);
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push(source.id);
      } else {
        skippedSources.push(source.id);
      }
    }

    return {
      graph_db: store.path,
      indexed_sources: indexedSources,
      skipped_sources: skippedSources,
      stats: graphStats(store),
    };
  } finally {
    store.db.close();
  }
}

function reportProvenance(repoRoot: string, reportPath: string) {
  if (!existsSync(reportPath)) return null;
  const bytes = readFileSync(reportPath);
  const report = JSON.parse(bytes.toString("utf8")) as { measures?: { matched_code_percent?: unknown } };
  const matchPercent = Number(report.measures?.matched_code_percent);
  const revisionResult = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "--verify", "HEAD"], { stderr: "ignore" });
  const revision = revisionResult.exitCode === 0 ? revisionResult.stdout.toString().trim() || null : null;
  return {
    path: resolve(reportPath),
    mtimeMs: statSync(reportPath).mtimeMs,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    revision,
    matchedCodePercent: Number.isFinite(matchPercent) ? matchPercent : null,
  };
}

export function defaultGraphSources(): string[] {
  // Registry document sources are librarian input, so default rebuilds exclude them.
  // Opt in by listing document source ids in options.sources (kg CLI: --sources).
  return [...STATIC_GRAPH_SOURCES];
}
