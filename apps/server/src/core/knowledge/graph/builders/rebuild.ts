import { buildAgentSharedStateGraphRecords } from "./agent-shared-state.js";
import { buildCodeGraphRecords } from "./code-graph.js";
import { insertGraphRecords, openKnowledgeGraph, resetKnowledgeGraph, upsertSourceDescriptor, upsertToolDescriptor, graphStats } from "../db.js";
import { buildKnowledgeCuratorGraphRecords } from "./knowledge-curator.js";
import { buildMismatchPatternGraphRecords } from "./mismatch-patterns.js";
import { buildOpseqSimilarityGraphRecords } from "./opseq-similarity.js";
import { buildPastPrsGraphRecords } from "./past-prs.js";
import {
  buildDiscordKnowledgeGraphRecords,
  buildDecompStandardsGraphRecords,
  buildExternalMirrorsGraphRecords,
  buildPathFactsGraphRecords,
  buildPowerpcDocsGraphRecords,
  buildSsbmDataSheetGraphRecords,
} from "./source-slices.js";
import { readSourceRegistry, readToolRegistry } from "../registry/sources.js";

export interface RebuildKnowledgeGraphOptions {
  repoRoot: string;
  dbPath?: string;
  sources?: string[];
  agentStateEnrichmentPath?: string;
  knowledgeCuratorEnrichmentPath?: string;
}

export function rebuildKnowledgeGraph(options: RebuildKnowledgeGraphOptions): Record<string, unknown> {
  const selected = new Set(options.sources && options.sources.length > 0 ? options.sources : defaultGraphSources());
  const store = openKnowledgeGraph(options.dbPath);
  const indexedSources: string[] = [];
  const skippedSources: string[] = [];
  try {
    resetKnowledgeGraph(store);
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
    const optionalSources = [
      ["discord_knowledge", buildDiscordKnowledgeGraphRecords],
      ["ssbm_data_sheet", buildSsbmDataSheetGraphRecords],
      ["powerpc_docs", buildPowerpcDocsGraphRecords],
      ["external_mirrors", buildExternalMirrorsGraphRecords],
      ["decomp_standards", buildDecompStandardsGraphRecords],
      ["path_facts", buildPathFactsGraphRecords],
    ] as const;
    for (const [sourceId, builder] of optionalSources) {
      if (!selected.has(sourceId)) continue;
      const records = builder();
      if (records) {
        insertGraphRecords(store, records);
        indexedSources.push(sourceId);
      } else {
        skippedSources.push(sourceId);
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

export function defaultGraphSources(): string[] {
  // Deprecated external/source slices are intentionally absent from default
  // ingestion. Re-include discord_knowledge, ssbm_data_sheet, or
  // external_mirrors via --sources for manual archaeology or experiments.
  return [
    "code_graph",
    "past_prs",
    "powerpc_docs",
    "decomp_standards",
    "path_facts",
    "agent_shared_state",
    "curator_enrichment",
    "mismatch_patterns",
    "opseq_similarity",
  ];
}
