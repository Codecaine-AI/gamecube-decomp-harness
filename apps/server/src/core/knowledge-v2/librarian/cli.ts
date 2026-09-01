import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameKnowledgeRoot } from "@server/core/knowledge/paths.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import {
  LIBRARIAN_PATHWAYS,
  librarianRunDirectory,
  librarianStopFile,
  runLibrarianConsumer,
} from "./consumer.js";
import type { LibrarianPathway } from "./context.js";

export interface LibrarianCliArgs {
  runId: string;
  stop: boolean;
  status: boolean;
  json: boolean;
  dryRun: boolean;
  limit?: number;
  concurrency: number;
  pathway?: LibrarianPathway;
  taskId?: string;
  knowledgeRoot?: string;
}

export interface LibrarianStatus {
  runId: string;
  logPath: string;
  passesLogged: number;
  passesCompleted: number;
  passesFailed: number;
  tasksSplit: number;
  malformedLogLines: number;
  queue: Record<LibrarianPathway, { queued: number; claimed: number; done: number }>;
  indexedTargets: number;
  indexedEntities: number;
}

interface QueueCountRow {
  pathway: LibrarianPathway;
  queued: number;
  claimed: number;
  done: number;
}

interface SubjectIndexCounts {
  targets: number;
  entities: number;
}

export function parseLibrarianArgs(args: Map<string, string | true>): LibrarianCliArgs {
  const runId = requiredStringArg(args, "--run-id");
  const pathwayArg = optionalStringArg(args, "--pathway");
  let pathway: LibrarianPathway | undefined;
  if (pathwayArg !== undefined) {
    if (!(LIBRARIAN_PATHWAYS as readonly string[]).includes(pathwayArg)) {
      throw new Error(`--pathway must be one of: ${LIBRARIAN_PATHWAYS.join(", ")}`);
    }
    pathway = pathwayArg as LibrarianPathway;
  }
  return {
    runId,
    stop: args.get("--stop") === true,
    status: args.get("--status") === true,
    json: args.get("--json") === true,
    dryRun: args.get("--dry-run") === true,
    limit: optionalNonNegativeIntegerArg(args, "--limit"),
    concurrency: positiveIntegerArg(args, "--concurrency", 4),
    pathway,
    taskId: optionalStringArg(args, "--task"),
    knowledgeRoot: optionalStringArg(args, "--knowledge-root"),
  };
}

export async function kg2Librarian(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const parsed = parseLibrarianArgs(args);
  const stopFile = librarianStopFile(globals.stateDir, parsed.runId);

  if (parsed.stop) {
    mkdirSync(dirname(stopFile), { recursive: true });
    closeSync(openSync(stopFile, "a"));
    console.log(`Stop requested for kg2-librarian run ${parsed.runId}: ${stopFile}`);
    return;
  }

  const gameId = globals.game?.gameId ?? globals.gameId ?? "melee";
  const knowledgeRoot = parsed.knowledgeRoot === undefined
    ? gameKnowledgeRoot(gameId)
    : resolve(parsed.knowledgeRoot);
  const open = (): KnowledgeStore => parsed.knowledgeRoot === undefined
    ? openKnowledgeStore({ gameId })
    : openKnowledgeStore({ knowledgeRoot });

  if (parsed.status) {
    const store = open();
    try {
      const status = readStatus(store, globals.stateDir, parsed.runId);
      if (parsed.json) console.log(JSON.stringify(status));
      else printStatus(status);
    } finally {
      store.close();
    }
    return;
  }

  let store: KnowledgeStore | undefined;
  const previousKnowledgeRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  try {
    store = open();
    if (parsed.knowledgeRoot !== undefined) process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;
    await runLibrarianConsumer(store, {
      runId: parsed.runId,
      limit: parsed.limit,
      concurrency: parsed.concurrency,
      pathway: parsed.pathway,
      taskId: parsed.taskId,
      dryRun: parsed.dryRun,
      stopFile,
      globals,
      prsRoot: resolve(knowledgeRoot, "sources/code_context/past_prs/data/prs"),
    });
  } finally {
    if (parsed.knowledgeRoot !== undefined) {
      if (previousKnowledgeRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previousKnowledgeRoot;
    }
    store?.close();
  }
}

export function readStatus(store: KnowledgeStore, stateDir: string, runId: string): LibrarianStatus {
  const logPath = resolve(librarianRunDirectory(stateDir, runId), "run-log.jsonl");
  let passesLogged = 0;
  let passesFailed = 0;
  let tasksSplit = 0;
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
        if (entry.status === "split") {
          tasksSplit += 1;
          continue;
        }
        passesLogged += 1;
        if (entry.status === "failed") passesFailed += 1;
      } catch {
        malformedLogLines += 1;
      }
    }
  }
  const queue = Object.fromEntries(
    LIBRARIAN_PATHWAYS.map((pathway) => [pathway, { queued: 0, claimed: 0, done: 0 }]),
  ) as LibrarianStatus["queue"];
  for (const row of store.db.query<QueueCountRow, []>(`
    SELECT pathway,
      SUM(CASE WHEN started_at IS NULL AND done_at IS NULL THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN started_at IS NOT NULL AND done_at IS NULL THEN 1 ELSE 0 END) AS claimed,
      SUM(CASE WHEN done_at IS NOT NULL THEN 1 ELSE 0 END) AS done
    FROM index_task
    GROUP BY pathway
  `).all()) {
    if (row.pathway in queue) {
      queue[row.pathway] = { queued: row.queued, claimed: row.claimed, done: row.done };
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
    tasksSplit,
    malformedLogLines,
    queue,
    indexedTargets: indexed.targets,
    indexedEntities: indexed.entities,
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printStatus(status: LibrarianStatus): void {
  const queue = LIBRARIAN_PATHWAYS
    .map((pathway) => {
      const counts = status.queue[pathway];
      return `${pathway} ${counts.queued} queued/${counts.claimed} claimed/${counts.done} done`;
    })
    .join(", ");
  console.log(
    `kg2-librarian ${status.runId}: ${status.passesCompleted} completed, ${status.passesFailed} failed, `
      + `${status.tasksSplit} split, ${status.indexedTargets} targets indexed, `
      + `${status.indexedEntities} entities indexed, ${status.malformedLogLines} malformed log lines; `
      + `queue: ${queue}`,
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
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} requires a value`);
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
