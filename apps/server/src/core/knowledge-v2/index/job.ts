import { DEFAULT_GAME_ID } from "@server/core/game-registry";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import {
  openKnowledgeIndexDb,
  type FtsSource,
  type KnowledgeIndexDb,
} from "./db.js";
import {
  buildAttemptFts,
  buildDiscordFts,
  buildPrFts,
  buildWikiFts,
} from "./fts.js";
import { buildEmbeddingIndex } from "./embeddings/indexer.js";
import { createOpenAiEmbeddingProvider } from "./embeddings/provider.js";
import { createPastPrsArchive } from "./pr-archive.js";
import {
  rebuildSearchIndexes,
  type RebuildSearchIndexesResult,
} from "./rebuild.js";

const FTS_SOURCES = ["discord", "wiki", "pr", "attempt"] as const;

export async function kg2Index(
  globals: GlobalArgs,
  args: Map<string, string | true>,
): Promise<void> {
  const source = sourceArg(args);
  const sources: FtsSource[] | undefined = source === undefined ? undefined : [source];
  const explicitFts = args.get("--fts") === true;
  const explicitEmbeddings = args.get("--embeddings") === true;
  const all = args.get("--all") === true || (!explicitFts && !explicitEmbeddings);
  const fts = all || explicitFts;
  const embeddings = (all || explicitEmbeddings) && args.get("--no-embeddings") !== true;
  const allWikiRevisions = args.get("--all-wiki-revisions") === true;
  const rebuild = args.get("--rebuild") === true;
  const knowledgeRoot = optionalStringArg(args, "--knowledge-root");
  const embeddingModel = optionalStringArg(args, "--embedding-model");
  const gameId = globals.gameId ?? DEFAULT_GAME_ID;

  let store: KnowledgeStore | undefined;
  let indexDb: KnowledgeIndexDb | undefined;
  try {
    store = knowledgeRoot === undefined
      ? openKnowledgeStore({ gameId })
      : openKnowledgeStore({ knowledgeRoot });
    indexDb = knowledgeRoot === undefined
      ? openKnowledgeIndexDb({ gameId })
      : openKnowledgeIndexDb({ knowledgeRoot });

    const provider = embeddings
      ? createOpenAiEmbeddingProvider({ model: embeddingModel })
      : undefined;
    let result: RebuildSearchIndexesResult;
    if (rebuild) {
      result = await rebuildSearchIndexes(store, indexDb, {
        fts,
        embeddings,
        sources,
        allWikiRevisions,
        provider,
      });
    } else {
      result = await buildIndexesIncrementally(store, indexDb, {
        fts,
        embeddings,
        sources,
        allWikiRevisions,
        provider,
      });
    }
    console.log(JSON.stringify(result));
  } finally {
    indexDb?.close();
    store?.close();
  }
}

interface BuildIndexesOptions {
  fts: boolean;
  embeddings: boolean;
  sources?: FtsSource[];
  allWikiRevisions: boolean;
  provider?: ReturnType<typeof createOpenAiEmbeddingProvider>;
}

async function buildIndexesIncrementally(
  store: KnowledgeStore,
  indexDb: KnowledgeIndexDb,
  options: BuildIndexesOptions,
): Promise<RebuildSearchIndexesResult> {
  const sources = options.sources ?? [...FTS_SOURCES];
  const prArchive = createPastPrsArchive();
  const result: RebuildSearchIndexesResult = {};

  if (options.fts) {
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

  if (options.embeddings) {
    if (options.provider === undefined) {
      throw new Error("An embedding provider is required to build embedding indexes");
    }
    result.embeddings = await buildEmbeddingIndex(store, indexDb, options.provider, {
      kinds: sources.filter((source) => source !== "attempt"),
      allWikiRevisions: options.allWikiRevisions,
      prArchive,
    });
  }

  return result;
}

function sourceArg(args: Map<string, string | true>): FtsSource | undefined {
  const source = optionalStringArg(args, "--source");
  if (source === undefined) return undefined;
  if (!FTS_SOURCES.includes(source as FtsSource)) {
    throw new Error(`--source must be one of: ${FTS_SOURCES.join("|")}`);
  }
  return source as FtsSource;
}

function optionalStringArg(args: Map<string, string | true>, name: string): string | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
