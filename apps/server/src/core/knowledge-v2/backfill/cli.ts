import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameKnowledgeRoot } from "@server/core/knowledge/paths.js";
import {
  KNOWLEDGE_INDEX_DB_FILENAME,
  openKnowledgeIndexDb,
  type KnowledgeIndexDb,
} from "../index/db.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { runBackfill } from "./runner.js";

interface BackfillStatus {
  runId: string;
  logPath: string;
  passesLogged: number;
  passesCompleted: number;
  passesFailed: number;
  malformedLogLines: number;
  indexedTargets: number;
  indexedEntities: number;
}

interface SubjectIndexCounts {
  targets: number;
  entities: number;
}

export async function kg2Backfill(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const runId = requiredStringArg(args, "--run-id");
  const stopFile = resolve(globals.stateDir, "knowledge_v2", "backfill", `${runId}.stop`);

  if (args.get("--stop") === true) {
    mkdirSync(dirname(stopFile), { recursive: true });
    closeSync(openSync(stopFile, "a"));
    console.log(`Stop requested for kg2-backfill run ${runId}: ${stopFile}`);
    return;
  }

  const explicitRoot = optionalStringArg(args, "--knowledge-root");
  const gameId = globals.gameId ?? "melee";
  const knowledgeRoot = explicitRoot === undefined ? gameKnowledgeRoot(gameId) : resolve(explicitRoot);
  if (args.get("--status") === true) {
    const store = explicitRoot === undefined ? openKnowledgeStore({ gameId }) : openKnowledgeStore({ knowledgeRoot });
    try {
      const status = readStatus(store, globals.stateDir, runId);
      if (args.get("--json") === true) console.log(JSON.stringify(status));
      else printStatus(status);
    } finally {
      store.close();
    }
    return;
  }

  const limit = optionalNonNegativeIntegerArg(args, "--limit");
  const concurrency = positiveIntegerArg(args, "--concurrency", 4);
  const minDirectScore = optionalNonNegativeNumberArg(args, "--min-direct-score");
  const dryRun = args.get("--dry-run") === true;
  let store: KnowledgeStore | undefined;
  let indexDb: KnowledgeIndexDb | undefined;
  const previousKnowledgeRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  try {
    store = explicitRoot === undefined ? openKnowledgeStore({ gameId }) : openKnowledgeStore({ knowledgeRoot });
    if (existsSync(resolve(knowledgeRoot, KNOWLEDGE_INDEX_DB_FILENAME))) {
      indexDb = openKnowledgeIndexDb({ knowledgeRoot });
    }
    if (explicitRoot !== undefined) process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;
    await runBackfill(store, {
      runId,
      limit,
      concurrency,
      minDirectScore,
      dryRun,
      stopFile,
      globals,
      indexDb,
      prsRoot: resolve(knowledgeRoot, "sources/code_context/past_prs/data/prs"),
    });
  } finally {
    if (explicitRoot !== undefined) {
      if (previousKnowledgeRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previousKnowledgeRoot;
    }
    indexDb?.close();
    store?.close();
  }
}

function readStatus(store: KnowledgeStore, stateDir: string, runId: string): BackfillStatus {
  const logPath = resolve(stateDir, "knowledge_v2", "backfill", runId, "run-log.jsonl");
  let passesLogged = 0;
  let passesFailed = 0;
  let malformedLogLines = 0;
  if (existsSync(logPath)) {
    for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        const entry: unknown = JSON.parse(line);
        if (!isJsonObject(entry)) {
          malformedLogLines += 1;
          continue;
        }
        passesLogged += 1;
        if ("error" in entry && entry.error !== null && entry.error !== undefined) passesFailed += 1;
      } catch {
        malformedLogLines += 1;
      }
    }
  }
  const indexed = store.db.query<SubjectIndexCounts, []>(`
    SELECT
      COUNT(target_id) AS targets,
      COUNT(entity_id) AS entities
    FROM subject_index_state
  `).get() ?? { targets: 0, entities: 0 };
  return {
    runId,
    logPath,
    passesLogged,
    passesCompleted: passesLogged - passesFailed,
    passesFailed,
    malformedLogLines,
    indexedTargets: indexed.targets,
    indexedEntities: indexed.entities,
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printStatus(status: BackfillStatus): void {
  console.log(
    `kg2-backfill ${status.runId}: ${status.passesCompleted} completed, ${status.passesFailed} failed, `
      + `${status.indexedTargets} targets indexed, ${status.indexedEntities} entities indexed, `
      + `${status.malformedLogLines} malformed log lines`,
  );
}

function requiredStringArg(args: Map<string, string | true>, name: string): string {
  const value = args.get(name);
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} requires a value`);
  return value;
}

function optionalStringArg(args: Map<string, string | true>, name: string): string | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} requires a value`);
  return value;
}

function optionalNonNegativeIntegerArg(args: Map<string, string | true>, name: string): number | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`${name} requires a non-negative integer`);
  return Number(value);
}

function positiveIntegerArg(args: Map<string, string | true>, name: string, fallback: number): number {
  const value = args.get(name);
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new Error(`${name} requires a positive integer`);
  return Number(value);
}

function optionalNonNegativeNumberArg(args: Map<string, string | true>, name: string): number | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} requires a non-negative number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} requires a non-negative number`);
  return parsed;
}
