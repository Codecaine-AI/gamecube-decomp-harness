import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameKnowledgeRoot } from "@server/core/knowledge/paths.js";
import { openKnowledgeStore } from "../storage/store.js";
import { immediateTransaction } from "../storage/transaction.js";
import { importAttempts } from "./attempts.js";
import { importDiscord } from "./discord.js";
import { extractEntities } from "./entities.js";
import { classifyLedger } from "./ledger-classification.js";
import { importPrs } from "./prs.js";
import { reconcileReport } from "./reconcile.js";
import { importWiki } from "./wiki.js";

const INGEST_LANES = ["discord", "wiki", "prs", "attempts", "reconcile", "entities", "all"] as const;
type IngestLane = (typeof INGEST_LANES)[number];
const RESET_SOURCES = ["wiki"] as const;
type ResetSource = (typeof RESET_SOURCES)[number];

interface ResetResult {
  source: ResetSource;
  wikiSections: number;
  watermarks: number;
  indexTasks: number;
}

export interface IngestPaths {
  discordRawRoot: string;
  discordChannelsConfigPath: string;
  wikiDataRoot: string;
  prsRoot: string;
  ledgerPath: string;
  reportPath: string;
  checkoutRoot: string;
  orchestratorDbPath: string;
}

export function resolveIngestPaths(knowledgeRoot: string): IngestPaths {
  const gameRoot = dirname(knowledgeRoot);
  return {
    discordRawRoot: resolve(knowledgeRoot, "sources/rag_search/discord_raw/data/raw"),
    discordChannelsConfigPath: resolve(knowledgeRoot, "sources/rag_search/discord_raw/config/channels.json"),
    wikiDataRoot: resolve(knowledgeRoot, "sources/rag_search/smashwiki/data"),
    prsRoot: resolve(knowledgeRoot, "sources/code_context/past_prs/data/prs"),
    ledgerPath: resolve(knowledgeRoot, "ledger/learnings.jsonl"),
    reportPath: resolve(gameRoot, "checkout/build/GALE01/report.json"),
    checkoutRoot: resolve(gameRoot, "checkout"),
    orchestratorDbPath: resolve(gameRoot, "state/orchestrator.sqlite"),
  };
}

function parseLane(args: Map<string, string | true>): IngestLane {
  const lane = stringArg(args, "--lane", "all");
  if (!INGEST_LANES.includes(lane as IngestLane)) {
    throw new Error(`--lane must be one of: ${INGEST_LANES.join(", ")}`);
  }
  return lane as IngestLane;
}

function parseResetSource(args: Map<string, string | true>, lane: IngestLane): ResetSource | undefined {
  if (!args.has("--reset-source")) return undefined;
  const source = stringArg(args, "--reset-source", "");
  if (!RESET_SOURCES.includes(source as ResetSource)) {
    throw new Error(`--reset-source must be one of: ${RESET_SOURCES.join(", ")}`);
  }
  if (lane !== "wiki" && lane !== "all") {
    throw new Error("--reset-source wiki requires --lane wiki or --lane all");
  }
  return source as ResetSource;
}

// Removes dead wiki ids from the pre-`~` encoding. This is the supported repeatable repair path.
function resetWikiSource(store: ReturnType<typeof openKnowledgeStore>, dryRun: boolean): ResetResult {
  return immediateTransaction(store.db, () => {
    const wikiSections = store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM wiki_section").get()!.count;
    const watermarks = store.db.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM source_watermark WHERE source = 'wiki'",
    ).get()!.count;
    const indexTasks = store.db.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM index_task WHERE pathway = 'archival_ingest' AND json_extract(payload, '$.source') = 'wiki'",
    ).get()!.count;
    if (!dryRun) {
      store.db.run("DELETE FROM wiki_section");
      store.db.run("DELETE FROM source_watermark WHERE source = 'wiki'");
      store.db.run("DELETE FROM index_task WHERE pathway = 'archival_ingest' AND json_extract(payload, '$.source') = 'wiki'");
    }
    return { source: "wiki", wikiSections, watermarks, indexTasks };
  });
}

export async function kg2Ingest(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const lane = parseLane(args);
  const resetSource = parseResetSource(args, lane);
  const reattribute = args.has("--reattribute");
  if (reattribute && lane !== "prs" && lane !== "all") {
    throw new Error("--reattribute requires --lane prs or --lane all");
  }
  const dryRun = args.has("--dry-run");
  const gameId = globals.gameId ?? "melee";
  const gameRootOverride = stringArg(args, "--game-root", "");
  const defaultKnowledgeRoot = gameRootOverride
    ? resolve(gameRootOverride, "knowledge")
    : gameKnowledgeRoot(gameId);
  const knowledgeRoot = resolve(stringArg(args, "--knowledge-root", defaultKnowledgeRoot));
  const defaults = resolveIngestPaths(knowledgeRoot);
  const paths: IngestPaths = {
    ...defaults,
    reportPath: resolve(stringArg(args, "--report", defaults.reportPath)),
    checkoutRoot: resolve(stringArg(args, "--checkout-root", defaults.checkoutRoot)),
    orchestratorDbPath: resolve(stringArg(args, "--orchestrator-db", defaults.orchestratorDbPath)),
  };
  let temporaryRoot: string | undefined;
  const storeRoot = dryRun && !existsSync(resolve(knowledgeRoot, "knowledge.sqlite"))
    ? (temporaryRoot = mkdtempSync(resolve(tmpdir(), "kg2-ingest-")))
    : knowledgeRoot;
  const results: Record<string, unknown> = {};
  const selected = (candidate: Exclude<IngestLane, "all">) => lane === "all" || lane === candidate;
  const skip = (candidate: string, input: string) => console.error(`[kg2-ingest] skipping ${candidate}: input not found: ${input}`);
  let store: ReturnType<typeof openKnowledgeStore> | undefined;

  try {
    store = openKnowledgeStore({ knowledgeRoot: storeRoot });
    if (selected("reconcile")) {
      if (existsSync(paths.reportPath)) results.reconcile = reconcileReport(store, { reportPath: paths.reportPath, dryRun });
      else skip("reconcile", paths.reportPath);
    }
    if (selected("entities")) {
      if (!existsSync(paths.reportPath)) skip("entities", paths.reportPath);
      else if (!existsSync(paths.checkoutRoot)) skip("entities", paths.checkoutRoot);
      else results.entities = extractEntities(store, { reportPath: paths.reportPath, checkoutRoot: paths.checkoutRoot, dryRun });
    }
    if (selected("discord")) {
      if (!existsSync(paths.discordRawRoot)) skip("discord", paths.discordRawRoot);
      else if (!existsSync(paths.discordChannelsConfigPath)) skip("discord", paths.discordChannelsConfigPath);
      else results.discord = importDiscord(store, { rawRoot: paths.discordRawRoot, channelsConfigPath: paths.discordChannelsConfigPath, dryRun });
    }
    if (resetSource === "wiki") results.reset = resetWikiSource(store, dryRun);
    if (selected("wiki")) {
      if (existsSync(paths.wikiDataRoot)) results.wiki = importWiki(store, { dataRoot: paths.wikiDataRoot, dryRun });
      else skip("wiki", paths.wikiDataRoot);
    }
    if (selected("prs")) {
      if (existsSync(paths.prsRoot)) results.prs = importPrs(store, { prsRoot: paths.prsRoot, dryRun, reattribute });
      else skip("prs", paths.prsRoot);
    }
    if (selected("attempts")) {
      if (existsSync(paths.orchestratorDbPath)) results.attempts = importAttempts(store, { orchestratorDbPath: paths.orchestratorDbPath, dryRun });
      else skip("attempts", paths.orchestratorDbPath);
    }
    if (lane === "all") {
      if (existsSync(paths.ledgerPath)) results.ledger = classifyLedger({ ledgerPath: paths.ledgerPath });
      else skip("ledger", paths.ledgerPath);
    }
    console.log(JSON.stringify({ lane, dryRun, results }, null, 2));
  } finally {
    store?.close();
    if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
