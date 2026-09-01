import { resolve } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { openState } from "@server/core/orchestrator-state";
import { openKnowledgeStore } from "../storage/store.js";
import { runRenarrate, type RenarrateOutcome } from "./runner.js";

const OUTCOMES = new Set<RenarrateOutcome>(["match", "improvement", "no_change", "error"]);

export async function kg2Renarrate(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const limit = optionalNonNegativeInteger(args, "--limit");
  const concurrency = positiveInteger(args, "--concurrency", 4);
  const dryRun = args.get("--dry-run") === true;
  const stopFileArg = optionalString(args, "--stop-file");
  const outcome = optionalOutcome(args, "--outcome");
  const workerStateId = optionalString(args, "--worker-state-id");
  const knowledge = openKnowledgeStore({ gameId: globals.game?.gameId ?? globals.gameId ?? "melee" });
  const orchestrator = openState(globals.stateDir);
  try {
    await runRenarrate(knowledge, {
      runId,
      globals,
      orchestratorStore: orchestrator,
      limit,
      concurrency,
      dryRun,
      stopFile: stopFileArg === undefined ? undefined : resolve(stopFileArg),
      outcome,
      workerStateId,
    });
  } finally {
    knowledge.close();
    orchestrator.db.close();
  }
}

function optionalString(args: Map<string, string | true>, name: string): string | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} requires a value`);
  return value;
}

function optionalNonNegativeInteger(args: Map<string, string | true>, name: string): number | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`${name} requires a non-negative integer`);
  return Number(value);
}

function positiveInteger(args: Map<string, string | true>, name: string, fallback: number): number {
  const value = args.get(name);
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new Error(`${name} requires a positive integer`);
  return Number(value);
}

function optionalOutcome(args: Map<string, string | true>, name: string): RenarrateOutcome | undefined {
  const value = optionalString(args, name);
  if (value === undefined) return undefined;
  if (!OUTCOMES.has(value as RenarrateOutcome)) throw new Error(`${name} requires match, improvement, no_change, or error`);
  return value as RenarrateOutcome;
}
