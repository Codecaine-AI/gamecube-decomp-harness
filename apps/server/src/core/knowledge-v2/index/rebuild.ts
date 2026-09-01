import type { KnowledgeStore } from "../storage/store.js";
import type { FtsSource, KnowledgeIndexDb } from "./db.js";
import {
  buildAttemptFts,
  buildDiscordFts,
  buildPrFts,
  buildWikiFts,
} from "./fts.js";
import { createPastPrsArchive, type PrArchive } from "./pr-archive.js";
import type { EmbeddingKind } from "./embeddings/chunker.js";
import {
  buildEmbeddingIndex,
  type BuildEmbeddingIndexResult,
} from "./embeddings/indexer.js";
import type { EmbeddingProvider } from "./embeddings/provider.js";

const ALL_FTS_SOURCES: readonly FtsSource[] = ["discord", "wiki", "pr", "attempt"];

export interface RebuildSearchIndexesOptions {
  fts?: boolean;
  embeddings?: boolean;
  sources?: FtsSource[];
  allWikiRevisions?: boolean;
  prArchive?: PrArchive;
  provider?: EmbeddingProvider;
}

export interface RebuildSearchIndexesResult {
  fts?: Partial<Record<FtsSource, number>>;
  embeddings?: BuildEmbeddingIndexResult;
}

export async function rebuildSearchIndexes(
  store: KnowledgeStore,
  indexDb: KnowledgeIndexDb,
  options: RebuildSearchIndexesOptions = {},
): Promise<RebuildSearchIndexesResult> {
  const rebuildFts = options.fts ?? true;
  const rebuildEmbeddings = options.embeddings ?? true;
  if (rebuildEmbeddings && options.provider === undefined) {
    throw new Error("An embedding provider is required to rebuild embedding indexes");
  }

  const sources = options.sources ?? [...ALL_FTS_SOURCES];
  const prArchive = options.prArchive ?? createPastPrsArchive();
  const result: RebuildSearchIndexesResult = {};

  if (rebuildFts) {
    const counts: Partial<Record<FtsSource, number>> = {};
    for (const source of sources) {
      switch (source) {
        case "discord":
          counts.discord = buildDiscordFts(store, indexDb);
          break;
        case "wiki":
          counts.wiki = buildWikiFts(store, indexDb, {
            allWikiRevisions: options.allWikiRevisions,
          });
          break;
        case "pr":
          counts.pr = buildPrFts(store, indexDb, { prArchive });
          break;
        case "attempt":
          counts.attempt = buildAttemptFts(store, indexDb);
          break;
      }
    }
    result.fts = counts;
  }

  if (rebuildEmbeddings) {
    const kinds = sources.filter((source): source is EmbeddingKind => source !== "attempt");
    result.embeddings = await buildEmbeddingIndex(store, indexDb, options.provider!, {
      kinds,
      allWikiRevisions: options.allWikiRevisions,
      prArchive,
      rebuild: true,
    });
  }

  return result;
}
